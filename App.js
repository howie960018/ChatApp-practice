import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, 
  KeyboardAvoidingView, Platform, FlatList, ActivityIndicator, Image, Keyboard,
  TouchableWithoutFeedback 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker'; 

// 引入 Firebase 核心與 Auth
import { auth, db } from './firebaseConfig';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  collection, query, onSnapshot, orderBy, where 
} from 'firebase/firestore';

// 引入 Helper
import { 
  createUser, 
  createChatRoom, 
  sendMessage, 
  sendImageMessage, 
  markRoomMessagesAsRead, 
  softDeleteMessage, 
  deleteConversation 
} from './firestoreSchema';

export default function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Auth
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);

  // List
  const [allUsers, setAllUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]); 
  const [searchKeyword, setSearchKeyword] = useState(''); 
  const [myChatRooms, setMyChatRooms] = useState([]);

  // Chat
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [currentChatPartner, setCurrentChatPartner] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef(null);

  // 1. Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setAllUsers([]);
        setFilteredUsers([]);
        setMyChatRooms([]);
        setCurrentRoomId(null);
      }
    });
    return unsubscribe;
  }, []);

  // 2. Users Listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.id !== user.uid);
      setAllUsers(usersData);
      if (!searchKeyword.trim()) setFilteredUsers(usersData);
    });
    return unsubscribe;
  }, [user]);

  // Search Logic
  useEffect(() => {
    if (!searchKeyword.trim()) {
      setFilteredUsers(allUsers);
    } else {
      const lower = searchKeyword.toLowerCase();
      const filtered = allUsers.filter(u => 
        u.displayName?.toLowerCase().includes(lower) || 
        u.email?.toLowerCase().includes(lower)
      );
      setFilteredUsers(filtered);
    }
  }, [searchKeyword, allUsers]);

  // 3. Rooms Listener
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'chatRooms'),
      where('participants', 'array-contains', user.uid),
      orderBy('lastMessageTime', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMyChatRooms(rooms);
    });
    return unsubscribe;
  }, [user]);

  // 4. Messages Listener
  useEffect(() => {
    if (!user || !currentRoomId) return;

    markRoomMessagesAsRead(currentRoomId, user.uid);

    const q = query(
      collection(db, 'chatRooms', currentRoomId, 'messages'), 
      orderBy('createdAt', 'asc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(msg => !msg.deletedFor?.includes(user.uid));
      
      setMessages(msgs);

      if (msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        if (!lastMsg.isRead && lastMsg.senderId !== user.uid) {
           markRoomMessagesAsRead(currentRoomId, user.uid);
        }
      }
    });
    return unsubscribe;
  }, [user, currentRoomId]);

  // Handlers
  const handleStartChat = async (targetUser) => {
    setIsLoading(true);
    try {
      const participantData = {
        [user.uid]: { displayName: displayName || user.email, avatarColor: '#007AFF' },
        [targetUser.id]: { displayName: targetUser.displayName, avatarColor: targetUser.avatarColor }
      };
      const roomId = await createChatRoom({ uid1: user.uid, uid2: targetUser.id, participantData });
      setCurrentChatPartner(targetUser);
      setCurrentRoomId(roomId);
    } catch (error) {
      Alert.alert("錯誤", "無法進入聊天室:" + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnterRoom = (room) => {
    const partnerId = room.participants.find(id => id !== user.uid);
    const partnerData = room.participantData?.[partnerId];
    setCurrentChatPartner({
      id: partnerId,
      displayName: partnerData?.displayName || '使用者',
      avatarColor: partnerData?.avatarColor || '#ccc'
    });
    setCurrentRoomId(room.id);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !currentRoomId) return;
    const textToSend = inputText.trim();
    setInputText(''); 

    try {
       const receiverId = currentChatPartner ? currentChatPartner.id : null;
       await sendMessage({
         roomId: currentRoomId,
         text: textToSend,
         senderId: user.uid,
         receiverId: receiverId
       });
       // 訊息送出後稍微延遲再捲動,確保鍵盤彈出/收回動畫順暢
       setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 200);
    } catch (error) {
      console.error("App.js 發送錯誤詳情:", error);
      Alert.alert("發送失敗", "請檢查網路連線");
    }
  };

  // 圖片選擇處理 (強化版)
  const handlePickImage = async () => {
    console.log('🖼️ 使用者點擊圖片按鈕');
    
    try {
      // 1. 請求權限
      console.log('🔐 請求媒體庫權限...');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        console.log('❌ 權限被拒絕');
        return Alert.alert(
          '權限不足', 
          '需要媒體庫權限才能選擇圖片,請到設定中開啟權限',
          [{ text: '確定' }]
        );
      }
      
      console.log('✅ 權限已授予');

      // 2. 啟動圖片選擇器
      console.log('📱 啟動圖片選擇器...');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7, // 壓縮品質 (0-1)
      });

      console.log('📋 圖片選擇結果:', {
        canceled: result.canceled,
        hasAssets: result.assets ? result.assets.length : 0
      });

      // 3. 檢查使用者是否取消
      if (result.canceled) {
        console.log('ℹ️ 使用者取消選擇圖片');
        return;
      }

      // 4. 驗證結果
      if (!result.assets || result.assets.length === 0) {
        console.log('❌ 沒有選擇到圖片');
        return Alert.alert('錯誤', '沒有選擇到圖片');
      }

      const imageUri = result.assets[0].uri;
      console.log('✅ 已選擇圖片:', imageUri);

      // 5. 驗證必要資料
      if (!currentRoomId) {
        console.log('❌ 沒有當前聊天室 ID');
        return Alert.alert('錯誤', '請先選擇聊天對象');
      }

      if (!user?.uid) {
        console.log('❌ 使用者未登入');
        return Alert.alert('錯誤', '請先登入');
      }

      // 6. 開始上傳
      console.log('⏳ 開始上傳圖片...');
      setIsLoading(true);
      
      const receiverId = currentChatPartner ? currentChatPartner.id : null;
      
      await sendImageMessage({
        roomId: currentRoomId,
        senderId: user.uid,
        receiverId: receiverId,
        imageUri: imageUri
      });

      console.log('✅ 圖片發送成功!');
      
      // 捲動到底部
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 300);
      
    } catch (error) {
      console.error('❌ handlePickImage 錯誤:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      
      Alert.alert(
        "圖片發送失敗", 
        error.message || '未知錯誤',
        [{ text: '確定' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleLongPressMessage = (messageId) => {
    Alert.alert("刪除訊息", "只會在您的裝置上刪除此訊息", [
      { text: "取消", style: "cancel" },
      { text: "刪除", style: "destructive", onPress: () => softDeleteMessage(currentRoomId, messageId, user.uid) }
    ]);
  };

  const handleLongPressRoom = (roomId) => {
    Alert.alert("刪除對話", "確定要刪除整個對話紀錄嗎?", [
      { text: "取消", style: "cancel" },
      { text: "刪除", style: "destructive", onPress: () => deleteConversation(roomId) }
    ]);
  };

  const handleAuthAction = async () => {
    if (!email || !password) return Alert.alert('錯誤', '請輸入帳號密碼');
    setIsLoading(true);
    try {
      if (isLoginMode) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await createUser({
            uid: cred.user.uid,
            email: email,
            displayName: displayName || 'User',
            avatarColor: '#FF6B6B'
        });
      }
    } catch (e) { Alert.alert('錯誤', e.message); }
    finally { setIsLoading(false); }
  };

  // ==========================================================================
  // 4. UI Render
  // ==========================================================================

  // 1. 登入頁
  if (!user) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ width: '100%', alignItems: 'center' }}
        >
          <Text style={styles.title}>{isLoginMode ? 'Chat App 登入' : '註冊新帳號'}</Text>
          <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"/>
          <TextInput style={styles.input} placeholder="密碼" value={password} onChangeText={setPassword} secureTextEntry/>
          {!isLoginMode && <TextInput style={styles.input} placeholder="暱稱" value={displayName} onChangeText={setDisplayName}/>}
          
          <TouchableOpacity style={styles.btn} onPress={handleAuthAction} disabled={isLoading}>
             {isLoading ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>{isLoginMode ? '登入' : '註冊'}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsLoginMode(!isLoginMode)} style={{marginTop:20}}>
            <Text style={{color:'#007AFF'}}>{isLoginMode ? '還沒有帳號?去註冊' : '已有帳號?去登入'}</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // 2. 聊天室頁 (修正鍵盤問題)
  if (currentRoomId) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        {/* 標題列固定在頂部 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setCurrentRoomId(null)} style={{padding:10}}>
            <Text style={{fontSize:24, color:'#007AFF'}}>‹</Text>
          </TouchableOpacity>
          <View style={{alignItems:'center'}}>
            <Text style={styles.headerTitle}>{currentChatPartner?.displayName}</Text>
          </View>
          <View style={{width:40}} /> 
        </View>

        {/* 修正重點:
          1. KeyboardAvoidingView 包住 FlatList 和 Input
          2. behavior 設為 padding (iOS) / undefined (Android)
          3. keyboardVerticalOffset 設為 Header 高度 + 安全區域
        */}
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0} 
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id}
            style={{flex:1, paddingHorizontal:10}}
            contentContainerStyle={{ paddingBottom: 10 }} // 底部留一點空間
            renderItem={({item}) => {
              const isMe = item.senderId === user.uid;
              return (
                <TouchableOpacity 
                  onLongPress={() => handleLongPressMessage(item.id)}
                  activeOpacity={0.8}
                  style={[styles.msgRow, isMe ? {justifyContent:'flex-end'} : {justifyContent:'flex-start'}]}
                >
                  <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleOther]}>
                    {item.type === 'image' ? (
                      <Image 
                        source={{uri: item.image}} 
                        style={{width: 200, height: 150, borderRadius: 10}} 
                        resizeMode="cover" 
                      />
                    ) : (
                      <Text style={isMe ? styles.textMe : styles.textOther}>{item.text}</Text>
                    )}
                    <View style={{flexDirection:'row', justifyContent:'flex-end', marginTop:4}}>
                      <Text style={styles.timeText}>
                        {item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '...'}
                      </Text>
                      {isMe && (
                         <Text style={{fontSize:10, color:'rgba(255,255,255,0.7)', marginLeft:4}}>{item.isRead ? '已讀' : '未讀'}</Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
            // 當使用者拖曳列表時,自動收起鍵盤
            onScrollBeginDrag={Keyboard.dismiss} 
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />
          
          <View style={styles.inputBar}>
            <TouchableOpacity 
              onPress={handlePickImage} 
              style={styles.iconBtn}
              disabled={isLoading}
            >
              <Text style={{fontSize:24}}>{isLoading ? '⏳' : '📷'}</Text>
            </TouchableOpacity>
            <TextInput 
              style={styles.inputMsg} 
              value={inputText} 
              onChangeText={setInputText} 
              placeholder="輸入訊息..."
              multiline
              editable={!isLoading}
            />
            <TouchableOpacity onPress={handleSendMessage} style={styles.sendBtn} disabled={isLoading}>
              {isLoading ? <ActivityIndicator size="small" color="#fff"/> : <Text style={{color:'#fff', fontWeight:'bold'}}>發送</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // 3. 列表頁 (大廳)
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>訊息</Text>
        <TouchableOpacity onPress={() => signOut(auth)}><Text style={{color:'red'}}>登出</Text></TouchableOpacity>
      </View>
      <View style={styles.searchBar}>
        <TextInput style={styles.searchInput} placeholder="搜尋聯絡人..." value={searchKeyword} onChangeText={setSearchKeyword}/>
      </View>
      <FlatList
        ListHeaderComponent={() => (
          <View>
            <Text style={styles.sectionTitle}>聯絡人</Text>
            <FlatList 
              horizontal 
              data={filteredUsers}
              keyExtractor={i => i.id}
              showsHorizontalScrollIndicator={false}
              style={{marginBottom: 20, paddingLeft:15}}
              renderItem={({item}) => (
                <TouchableOpacity style={styles.userAvatarItem} onPress={() => handleStartChat(item)}>
                  <View style={[styles.avatarCircle, {backgroundColor: item.avatarColor}]}><Text style={{color:'#fff', fontSize:18}}>{item.displayName?.[0]}</Text></View>
                  <Text style={{fontSize:12, marginTop:4}} numberOfLines={1}>{item.displayName}</Text>
                </TouchableOpacity>
              )}
            />
            <Text style={styles.sectionTitle}>最近對話</Text>
          </View>
        )}
        data={myChatRooms}
        keyExtractor={i => i.id}
        renderItem={({item}) => {
          const unreadCount = item.unreadCounts?.[user.uid] || 0;
          const partnerId = item.participants.find(id => id !== user.uid);
          const partner = item.participantData?.[partnerId] || {};
          return (
            <TouchableOpacity style={styles.chatItem} onPress={() => handleEnterRoom(item)} onLongPress={() => handleLongPressRoom(item.id)}>
              <View style={[styles.avatarCircle, {backgroundColor: partner.avatarColor || '#ccc', marginRight:12}]}><Text style={{color:'#fff'}}>{partner.displayName?.[0]}</Text></View>
              <View style={{flex:1}}>
                <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                  <Text style={styles.chatName}>{partner.displayName}</Text>
                  <Text style={styles.chatTime}>{item.lastMessageTime ? new Date(item.lastMessageTime.seconds * 1000).toLocaleDateString() : ''}</Text>
                </View>
                <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:4}}>
                  <Text style={[styles.chatPreview, unreadCount > 0 && {fontWeight:'bold', color:'#000'}]} numberOfLines={1}>
                    {item.lastMessage?.type === 'image' ? '[圖片]' : (item.lastMessage?.text || '...')}
                  </Text>
                  {unreadCount > 0 && <View style={styles.badge}><Text style={{color:'#fff', fontSize:10, fontWeight:'bold'}}>{unreadCount}</Text></View>}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={{textAlign:'center', marginTop:50, color:'#999'}}>暫無對話紀錄</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centerContainer: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 32, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: { backgroundColor: '#f0f0f0', padding: 15, borderRadius: 10, marginBottom: 10, width: '100%' },
  btn: { backgroundColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10, width: '100%' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  header: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:15, borderBottomWidth:1, borderBottomColor:'#eee', backgroundColor: '#fff' },
  headerTitle: { fontSize:18, fontWeight:'bold' },
  searchBar: { padding: 10, backgroundColor: '#fff' },
  searchInput: { backgroundColor: '#f0f0f0', padding: 10, borderRadius: 8 },
  sectionTitle: { fontSize:14, color:'#666', margin:15, fontWeight:'600' },
  userAvatarItem: { alignItems:'center', marginRight:15, width:60 },
  avatarCircle: { width:50, height:50, borderRadius:25, justifyContent:'center', alignItems:'center' },
  chatItem: { flexDirection:'row', padding:15, borderBottomWidth:1, borderBottomColor:'#f9f9f9', alignItems:'center' },
  chatName: { fontWeight:'bold', fontSize:16 },
  chatTime: { fontSize:12, color:'#999' },
  chatPreview: { color:'#666', flex:1 },
  badge: { backgroundColor:'#ff3b30', borderRadius:10, width:20, height:20, justifyContent:'center', alignItems:'center', marginLeft:5 },
  msgRow: { marginVertical:5, flexDirection:'row' },
  msgBubble: { padding:10, borderRadius:15, maxWidth:'75%' },
  msgBubbleMe: { backgroundColor:'#007AFF', borderBottomRightRadius:2 },
  msgBubbleOther: { backgroundColor:'#f0f0f0', borderBottomLeftRadius:2 },
  textMe: { color:'#fff', fontSize:16 },
  textOther: { color:'#000', fontSize:16 },
  timeText: { fontSize:10, color:'#ddd', alignSelf:'flex-end' },
  inputBar: { flexDirection:'row', padding:10, borderTopWidth:1, borderColor:'#eee', alignItems:'center', backgroundColor:'#fff' },
  inputMsg: { flex:1, backgroundColor:'#f0f0f0', borderRadius:20, paddingHorizontal:15, paddingVertical:8, marginRight:10, fontSize:16, maxHeight: 100 },
  sendBtn: { backgroundColor:'#007AFF', paddingHorizontal:15, paddingVertical:8, borderRadius:20 },
  iconBtn: { marginRight:10 },
});