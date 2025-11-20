import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, FlatList, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// 引入我們剛剛建立的 firebase 設定
import { auth, db } from './firebaseConfig';
// 引入 Firebase 的登入、註冊、登出、狀態監聽函式
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  onAuthStateChanged 
} from 'firebase/auth';
// 引入 Firestore 函式
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  where,
  getDocs
} from 'firebase/firestore';

export default function App() {
  // 定義狀態變數
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(''); // 暮稱
  const [user, setUser] = useState(null); // 存放目前登入的使用者資訊
  const [isLoginMode, setIsLoginMode] = useState(true); // 切換 "登入" 或 "註冊" 模式
  
  // 聊天室狀態
  const [message, setMessage] = useState(''); // 輸入的訊息
  const [messages, setMessages] = useState([]); // 所有訊息列表
  const flatListRef = useRef(null); // FlatList 的引用，用於捲動控制
  
  // 多個聊天室功能
  const [chatRooms, setChatRooms] = useState([]); // 所有聊天室列表
  const [currentRoomId, setCurrentRoomId] = useState(null); // 目前選擇的聊天室 ID
  const [showRoomList, setShowRoomList] = useState(true); // 是否顯示聊天室列表
  const [newRoomName, setNewRoomName] = useState(''); // 新聊天室名稱
  
  // 1對1私訊功能
  const [allUsers, setAllUsers] = useState([]); // 所有使用者列表
  const [currentChatUser, setCurrentChatUser] = useState(null); // 目前聊天對象的資料

  // 監聽使用者的登入狀態 (當 App 啟動時執行)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // 如果 currentUser 存在，代表已登入；如果是 null，代表未登入
      setUser(currentUser);
    });
    return unsubscribe; // 元件卸載時取消監聽
  }, []);

  // 監聽所有使用者（用於顯示聯絡人列表）
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter(u => u.id !== user.uid); // 過濾掉自己
      setAllUsers(usersData);
    });

    return unsubscribe;
  }, [user]);

  // 監聽我參與的聊天室（私訊）
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'chatRooms'),
      where('participants', 'array-contains', user.uid),
      orderBy('lastMessageTime', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const roomsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setChatRooms(roomsData);
    });

    return unsubscribe;
  }, [user]);

  // 即時監聽特定聊天室的 Firestore 訊息
  useEffect(() => {
    if (!user || !currentRoomId) return; // 只有登入且選擇了聊天室才監聽訊息

    const q = query(
      collection(db, 'chatRooms', currentRoomId, 'messages'), 
      orderBy('timestamp', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messagesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMessages(messagesData);
    });

    return unsubscribe; // 元件卸載時取消監聽
  }, [user, currentRoomId]);

  // 當訊息更新時，自動捲動到底部
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      // 使用 setTimeout 確保 FlatList 已經渲染完成
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  // 生成隨機頭像顏色
  const getRandomColor = () => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  // 建立新聊天室
  const handleCreateRoom = async () => {
    if (newRoomName.trim() === '') {
      Alert.alert('錯誤', '請輸入聊天室名稱');
      return;
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userData = userDoc.data();

      await addDoc(collection(db, 'chatRooms'), {
        name: newRoomName.trim(),
        createdBy: user.uid,
        createdByName: userData?.displayName || user.email,
        createdAt: serverTimestamp(),
        lastMessage: '',
        lastMessageTime: serverTimestamp()
      });

      setNewRoomName('');
      Alert.alert('成功', '聊天室已建立！');
    } catch (error) {
      console.error('建立聊天室失敗：', error);
      Alert.alert('錯誤', '聊天室建立失敗');
    }
  };

  // 建立或進入1對1私訊房間
  const startPrivateChat = async (otherUser) => {
    try {
      // 生成唯一的 Room ID（將兩個 UID 排序後連接）
      const roomId = [user.uid, otherUser.id].sort().join('_');
      
      // 檢查房間是否已存在
      const roomRef = doc(db, 'chatRooms', roomId);
      const roomSnap = await getDoc(roomRef);
      
      if (!roomSnap.exists()) {
        // 房間不存在，建立新的私訊房間
        const myUserDoc = await getDoc(doc(db, 'users', user.uid));
        const myUserData = myUserDoc.data();
        
        await setDoc(roomRef, {
          type: 'private',
          participants: [user.uid, otherUser.id],
          participantData: {
            [user.uid]: {
              displayName: myUserData?.displayName || user.email,
              avatarColor: myUserData?.avatarColor || '#999'
            },
            [otherUser.id]: {
              displayName: otherUser.displayName,
              avatarColor: otherUser.avatarColor
            }
          },
          createdAt: serverTimestamp(),
          lastMessage: '',
          lastMessageTime: serverTimestamp()
        });
      }
      
      // 設定當前聊天對象資料
      setCurrentChatUser(otherUser);
      
      // 進入房間
      setCurrentRoomId(roomId);
      setShowRoomList(false);
      setMessages([]);
    } catch (error) {
      console.error('開啟私訊失敗：', error);
      Alert.alert('錯誤', '無法開啟私訊');
    }
  };

  // 進入聊天室（從最近對話列表）
  const enterRoom = (roomId, roomData) => {
    // 如果是私訊，設定對方的資料
    if (roomData.type === 'private') {
      const otherUserId = roomData.participants.find(id => id !== user.uid);
      const otherUserData = roomData.participantData?.[otherUserId];
      if (otherUserData) {
        setCurrentChatUser({
          id: otherUserId,
          displayName: otherUserData.displayName,
          avatarColor: otherUserData.avatarColor
        });
      }
    } else {
      setCurrentChatUser(null);
    }
    
    setCurrentRoomId(roomId);
    setShowRoomList(false);
    setMessages([]); // 清空訊息
  };

  // 離開聊天室回到列表
  const leaveRoom = () => {
    setCurrentRoomId(null);
    setCurrentChatUser(null);
    setShowRoomList(true);
    setMessages([]);
  };

  // 處理註冊邏輯
  const handleRegister = async () => {
    if (email === '' || password === '') {
      Alert.alert('錯誤', '請輸入 Email 和密碼');
      return;
    }
    if (displayName.trim() === '') {
      Alert.alert('錯誤', '請輸入暮稱');
      return;
    }
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const userId = userCredential.user.uid;
      
      // 在 Firestore 儲存使用者資料
      await setDoc(doc(db, 'users', userId), {
        displayName: displayName.trim(),
        email: email,
        avatarColor: getRandomColor(),
        createdAt: serverTimestamp()
      });
      
      Alert.alert('成功', '註冊成功，已自動登入！');
    } catch (error) {
      Alert.alert('註冊失敗', error.message);
    }
  };

  // 處理登入邏輯
  const handleLogin = async () => {
    if (email === '' || password === '') {
      Alert.alert('錯誤', '請輸入 Email 和密碼');
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
      Alert.alert('成功', '歡迎回來！');
    } catch (error) {
      Alert.alert('登入失敗', '帳號或密碼錯誤，或是帳號不存在。');
      console.error(error);
    }
  };

  // 處理登出邏輯
  const handleLogout = async () => {
    try {
      await signOut(auth);
      Alert.alert('已登出', '您已成功登出');
      // 清空輸入框
      setEmail('');
      setPassword('');
      setDisplayName('');
      setMessages([]); // 清空訊息列表
    } catch (error) {
      console.error('登出錯誤', error);
    }
  };

  // 格式化時間顯示
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    
    const messageDate = timestamp.toDate();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const messageDay = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
    
    const timeStr = messageDate.toLocaleTimeString('zh-TW', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    
    if (messageDay.getTime() === today.getTime()) {
      return timeStr; // 今天：只顯示時間
    } else if (messageDay.getTime() === yesterday.getTime()) {
      return `昨天 ${timeStr}`; // 昨天
    } else {
      return messageDate.toLocaleDateString('zh-TW', { 
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    }
  };

  // 發送訊息到 Firestore
  const handleSendMessage = async () => {
    if (message.trim() === '') return; // 空白訊息不發送
    if (!currentRoomId) return; // 沒有選擇聊天室

    try {
      // 獲取使用者資料
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userData = userDoc.data();
      
      // 將訊息儲存到特定聊天室的 messages 子集合
      await addDoc(collection(db, 'chatRooms', currentRoomId, 'messages'), {
        text: message,
        userId: user.uid,
        userName: userData?.displayName || user.email,
        avatarColor: userData?.avatarColor || '#999',
        timestamp: serverTimestamp()
      });

      // 更新聊天室的最新訊息
      await setDoc(doc(db, 'chatRooms', currentRoomId), {
        lastMessage: message.substring(0, 50),
        lastMessageTime: serverTimestamp()
      }, { merge: true });

      setMessage(''); // 清空輸入框
      
      // 發送後立即捲動到底部
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('發送訊息失敗：', error);
      Alert.alert('錯誤', '訊息發送失敗');
    }
  };

  // 渲染每一則訊息
  const renderMessage = ({ item }) => {
    const isMyMessage = item.userId === user.uid;
    
    return (
      <View style={[
        styles.messageContainer,
        isMyMessage ? styles.myMessage : styles.otherMessage
      ]}>
        {!isMyMessage && (
          <View style={styles.messageHeader}>
            <View style={[styles.avatar, { backgroundColor: item.avatarColor || '#999' }]}>
              <Text style={styles.avatarText}>
                {item.userName ? item.userName.charAt(0).toUpperCase() : 'U'}
              </Text>
            </View>
            <Text style={styles.senderName}>{item.userName || '使用者'}</Text>
          </View>
        )}
        <View style={[
          styles.messageBubble,
          isMyMessage ? styles.myMessageBubble : styles.otherMessageBubble
        ]}>
          <Text style={[
            styles.messageText,
            isMyMessage ? styles.myMessageText : styles.otherMessageText
          ]}>
            {item.text}
          </Text>
        </View>
        <Text style={[
          styles.timeText,
          isMyMessage ? styles.myTimeText : styles.otherTimeText
        ]}>
          {formatTime(item.timestamp)}
        </Text>
      </View>
    );
  };

  // --- 畫面渲染 ---

  // 如果使用者已登入
  if (user) {
    // 顯示聊天室列表
    if (showRoomList) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.chatContainer}>
            {/* 標題列 */}
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>訊息</Text>
                <Text style={styles.headerSubtitle}>{user.email}</Text>
              </View>
              <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                <Text style={styles.logoutButtonText}>登出</Text>
              </TouchableOpacity>
            </View>

            {/* 聯絡人橫向列表 */}
            <View style={styles.usersSection}>
              <Text style={styles.usersSectionTitle}>聯絡人</Text>
              <FlatList
                horizontal
                data={allUsers}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.userItem}
                    onPress={() => startPrivateChat(item)}
                  >
                    <View style={[styles.userAvatar, { backgroundColor: item.avatarColor || '#999' }]}>
                      <Text style={styles.userAvatarText}>
                        {item.displayName ? item.displayName.charAt(0).toUpperCase() : 'U'}
                      </Text>
                    </View>
                    <Text style={styles.userName} numberOfLines={1}>
                      {item.displayName || '使用者'}
                    </Text>
                  </TouchableOpacity>
                )}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.usersListContent}
                ListEmptyComponent={
                  <Text style={styles.emptyUsers}>還沒有其他使用者</Text>
                }
              />
            </View>

            {/* 最近對話列表 */}
            <View style={styles.recentChatsHeader}>
              <Text style={styles.recentChatsTitle}>最近對話</Text>
            </View>
            
            <FlatList
              data={chatRooms}
              keyExtractor={item => item.id}
              renderItem={({ item }) => {
                // 獲取對方資料（私訊）
                let displayName = item.name || '聊天室';
                let avatarColor = '#007AFF';
                
                if (item.type === 'private') {
                  const otherUserId = item.participants?.find(id => id !== user.uid);
                  const otherUserData = item.participantData?.[otherUserId];
                  if (otherUserData) {
                    displayName = otherUserData.displayName || '使用者';
                    avatarColor = otherUserData.avatarColor || '#999';
                  }
                }
                
                return (
                  <TouchableOpacity 
                    style={styles.roomItem}
                    onPress={() => enterRoom(item.id, item)}
                  >
                    <View style={[styles.roomAvatar, { backgroundColor: avatarColor }]}>
                      <Text style={styles.roomAvatarText}>
                        {displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.roomInfo}>
                      <Text style={styles.roomName}>{displayName}</Text>
                      <Text style={styles.roomLastMessage} numberOfLines={1}>
                        {item.lastMessage || '開始聊天吧'}
                      </Text>
                    </View>
                    <Text style={styles.roomArrow}>›</Text>
                  </TouchableOpacity>
                );
              }}
              style={styles.roomList}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>還沒有對話</Text>
                  <Text style={styles.emptySubtext}>點擊上方聯絡人開始聊天！</Text>
                </View>
              }
            />
          </View>
        </SafeAreaView>
      );
    }

    // 顯示聊天室內容
    const currentRoom = chatRooms.find(room => room.id === currentRoomId);
    
    // 決定顯示的標題（私訊顯示對方名字）
    let chatTitle = '聊天室';
    if (currentChatUser) {
      chatTitle = currentChatUser.displayName || '使用者';
    } else if (currentRoom) {
      chatTitle = currentRoom.name || '聊天室';
    }
    
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.chatContainer}>
          {/* 聊天室標題列 */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={leaveRoom} style={{ marginRight: 15 }}>
                <Text style={{ color: 'white', fontSize: 24 }}>‹</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {currentChatUser && (
                  <View style={[styles.headerAvatar, { backgroundColor: currentChatUser.avatarColor || '#999' }]}>
                    <Text style={styles.headerAvatarText}>
                      {currentChatUser.displayName?.charAt(0).toUpperCase() || 'U'}
                    </Text>
                  </View>
                )}
                <View>
                  <Text style={styles.headerTitle}>{chatTitle}</Text>
                  <Text style={styles.headerSubtitle}>
                    {currentChatUser ? '線上' : user.email}
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Text style={styles.logoutButtonText}>登出</Text>
            </TouchableOpacity>
          </View>

          {/* 訊息列表 */}
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            style={styles.messagesList}
            contentContainerStyle={styles.messagesContent}
            onScrollBeginDrag={Keyboard.dismiss}
          />

          {/* 輸入框和發送按鈕 */}
          <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
          >
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.messageInput}
                placeholder="輸入訊息..."
                value={message}
                onChangeText={setMessage}
                multiline
              />
              <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
                <Text style={styles.sendButtonText}>發送</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </SafeAreaView>
    );
  }

  // 如果未登入，顯示 登入/註冊 表單
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.contentContainer}
      >
        <Text style={styles.loginHeaderTitle}>
          {isLoginMode ? '登入' : '註冊新帳號'}
        </Text>

        <View style={styles.loginInputContainer}>
          <TextInput
            style={styles.input}
            placeholder="請輸入 Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="請輸入密碼"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {!isLoginMode && (
            <TextInput
              style={styles.input}
              placeholder="請輸入暱稱"
              value={displayName}
              onChangeText={setDisplayName}
              maxLength={20}
            />
          )}
        </View>

        <TouchableOpacity 
          style={styles.button} 
          onPress={isLoginMode ? handleLogin : handleRegister}
        >
          <Text style={styles.buttonText}>
            {isLoginMode ? '登入' : '註冊'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsLoginMode(!isLoginMode)}>
          <Text style={styles.switchText}>
            {isLoginMode ? '還沒有帳號？點此註冊' : '已有帳號？點此登入'}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  chatContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#007AFF',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#E0E0E0',
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
  },
  logoutButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  messagesList: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  messagesContent: {
    padding: 10,
  },
  messageContainer: {
    marginVertical: 5,
    maxWidth: '80%',
  },
  myMessage: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  otherMessage: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
    marginLeft: 5,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  avatarText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  senderName: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  messageBubble: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    maxWidth: '100%',
  },
  myMessageBubble: {
    backgroundColor: '#007AFF',
  },
  otherMessageBubble: {
    backgroundColor: '#E5E5EA',
  },
  messageText: {
    fontSize: 16,
  },
  myMessageText: {
    color: 'white',
  },
  otherMessageText: {
    color: '#000',
  },
  timeText: {
    fontSize: 11,
    marginTop: 4,
  },
  myTimeText: {
    color: '#999',
    textAlign: 'right',
    marginRight: 5,
  },
  otherTimeText: {
    color: '#999',
    textAlign: 'left',
    marginLeft: 5,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    alignItems: 'center',
  },
  messageInput: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  sendButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  loginHeaderTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 40,
    color: '#333',
  },
  loginInputContainer: {
    width: '100%',
    marginBottom: 20,
  },
  input: {
    backgroundColor: 'white',
    paddingHorizontal: 15,
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  button: {
    backgroundColor: '#007AFF',
    width: '100%',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 16,
  },
  switchText: {
    marginTop: 20,
    color: '#007AFF',
    fontSize: 14,
  },
  // 使用者列表樣式
  usersSection: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingVertical: 10,
  },
  usersSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    paddingHorizontal: 15,
    marginBottom: 10,
  },
  usersListContent: {
    paddingHorizontal: 10,
  },
  userItem: {
    alignItems: 'center',
    marginHorizontal: 8,
    width: 70,
  },
  userAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  userAvatarText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  userName: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
  },
  emptyUsers: {
    fontSize: 14,
    color: '#999',
    paddingHorizontal: 15,
  },
  // 最近對話標題
  recentChatsHeader: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  recentChatsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  // 頭像在標題列
  headerAvatar: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerAvatarText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // 聊天室列表樣式
  createRoomContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  createRoomInput: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    fontSize: 16,
  },
  createRoomButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: 'center',
  },
  createRoomButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  roomList: {
    flex: 1,
  },
  roomItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  roomAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  roomAvatarText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  roomInfo: {
    flex: 1,
  },
  roomName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  roomLastMessage: {
    fontSize: 14,
    color: '#999',
  },
  roomArrow: {
    fontSize: 30,
    color: '#ccc',
    marginLeft: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginBottom: 10,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
  },
});