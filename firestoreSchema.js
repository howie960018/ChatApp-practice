// ============================================================================
// Cloudinary 圖片上傳 - 完整設定版本
// 適用於 React Native / Expo
// ============================================================================

import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  arrayUnion, 
  increment, 
  getDocs, 
  getDoc,
  writeBatch, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  limit 
} from 'firebase/firestore';
import { db } from './firebaseConfig';

// ============================================================================
// ⚠️ 重要設定 - 請填入你的 Cloudinary 資訊
// ============================================================================

// 從 Cloudinary Dashboard 複製
const CLOUDINARY_CONFIG = {
  CLOUD_NAME: 'dc9z72xi3',        // ✅ 已經正確
  UPLOAD_PRESET: 'ml_default',    // ← 改成你的 preset 名稱
};
// ============================================================================
// 1. 使用者與聊天室管理 (保持原樣)
// ============================================================================

export async function createUser({ uid, email, displayName, avatarColor }) {
  try {
    await setDoc(doc(db, 'users', uid), {
      uid,
      email,
      displayName,
      avatarColor,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("建立使用者失敗:", error);
    throw error;
  }
}

export async function createChatRoom({ uid1, uid2, participantData }) {
  const sortedUIDs = [uid1, uid2].sort();
  const roomId = `${sortedUIDs[0]}_${sortedUIDs[1]}`;
  
  const roomRef = doc(db, 'chatRooms', roomId);
  const roomSnap = await getDoc(roomRef);
  
  const roomData = {
    roomId,
    type: 'private',
    participants: sortedUIDs,
    participantData,
    ...(!roomSnap.exists() && {
      lastMessage: {},
      lastMessageTime: serverTimestamp(),
      unreadCounts: { [uid1]: 0, [uid2]: 0 },
    })
  };

  await setDoc(roomRef, roomData, { merge: true });
  return roomId;
}

export async function getRecentChatRooms(myUid) {
  const chatRoomsRef = collection(db, 'chatRooms');
  const q = query(
    chatRoomsRef, 
    where('participants', 'array-contains', myUid), 
    orderBy('lastMessageTime', 'desc')
  );
  
  const snapshot = await getDocs(q);
  const rooms = [];
  
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    if (!data.participants || !Array.isArray(data.participants)) return;
    const otherUid = data.participants.find((uid) => uid !== myUid);
    if (!otherUid) return;
    const otherUser = data.participantData?.[otherUid] || {};
    
    let lastMsgPreview = '';
    if (data.lastMessage) {
      lastMsgPreview = data.lastMessage.type === 'image' 
        ? '[圖片]' 
        : (data.lastMessage.text || '');
    }

    rooms.push({
      id: docSnap.id, 
      roomId: data.roomId,
      displayName: otherUser.displayName || '未知使用者',
      avatarColor: otherUser.avatarColor || '#ccc',
      lastMessage: lastMsgPreview,
      lastMessageTime: data.lastMessageTime,
      unreadCount: data.unreadCounts?.[myUid] || 0,
      participants: data.participants,
      participantData: data.participantData
    });
  });
  
  return rooms;
}

// ============================================================================
// 2. Cloudinary 圖片上傳
// ============================================================================

export async function uploadChatImage(roomId, uri) {
  console.log('📸 使用 Cloudinary 上傳圖片');
  console.log('   roomId:', roomId);
  console.log('   uri:', uri);
  
  try {
    // 檢查設定
    if (CLOUDINARY_CONFIG.UPLOAD_PRESET === 'YOUR_UPLOAD_PRESET') {
      throw new Error(
        '❌ 尚未設定 Cloudinary Upload Preset!\n\n' +
        '請按照以下步驟設定:\n' +
        '1. 到 Cloudinary Dashboard → Settings → Upload\n' +
        '2. 點擊 "Add upload preset"\n' +
        '3. Signing Mode 選擇 "Unsigned"\n' +
        '4. 儲存後將 Preset 名稱填入 firestoreSchema.js'
      );
    }
    
    // 1. 讀取圖片
    console.log('📥 讀取圖片...');
    const response = await fetch(uri);
    
    if (!response.ok) {
      throw new Error(`無法讀取圖片: HTTP ${response.status}`);
    }
    
    const blob = await response.blob();
    console.log('✅ Blob 轉換成功');
    console.log('   大小:', (blob.size / 1024).toFixed(2), 'KB');
    console.log('   類型:', blob.type);
    
    // 2. 檢查大小 (Cloudinary 免費版限制 10MB)
    const maxSize = 10 * 1024 * 1024; // 10 MB
    if (blob.size > maxSize) {
      throw new Error(`圖片太大 (${(blob.size / 1024 / 1024).toFixed(2)}MB),請壓縮後再試`);
    }
    
    // 3. 準備 FormData
    console.log('☁️ 上傳到 Cloudinary...');
    const formData = new FormData();
    formData.append('file', {
      uri: uri,
      type: blob.type || 'image/jpeg',
      name: `chat_${Date.now()}.jpg`,
    });
    formData.append('upload_preset', CLOUDINARY_CONFIG.UPLOAD_PRESET);
    formData.append('folder', `chat_images/${roomId}`);
    
    // 4. 上傳
    const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.CLOUD_NAME}/image/upload`;
    console.log('   上傳網址:', uploadUrl);
    
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json',
      },
    });
    
    console.log('   回應狀態:', uploadResponse.status);
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('   錯誤內容:', errorText);
      throw new Error(`Cloudinary 上傳失敗 (${uploadResponse.status}): ${errorText}`);
    }
    
    const result = await uploadResponse.json();
    console.log('✅ 上傳成功!');
    
    // 5. 取得圖片 URL
    const imageUrl = result.secure_url;
    console.log('🔗 圖片網址:', imageUrl);
    
    return imageUrl;
    
  } catch (error) {
    console.error('❌ Cloudinary 上傳失敗:', error);
    throw error;
  }
}

// ============================================================================
// 3. 訊息發送
// ============================================================================

export async function sendMessage({ roomId, text, senderId, receiverId }) {
  return await baseSendMessage({
    roomId,
    senderId,
    receiverId,
    messageData: {
      text,
      type: 'text',
      image: null
    }
  });
}

export async function sendImageMessage({ roomId, senderId, receiverId, imageUri }) {
  console.log('📤 準備發送圖片訊息');
  
  try {
    // 1. 上傳圖片到 Cloudinary
    console.log('⏳ 步驟 1/2: 上傳圖片...');
    const imageUrl = await uploadChatImage(roomId, imageUri);
    
    // 2. 寫入訊息到 Firestore
    console.log('⏳ 步驟 2/2: 寫入訊息...');
    const messageId = await baseSendMessage({
      roomId,
      senderId,
      receiverId,
      messageData: {
        text: '傳送了一張圖片',
        type: 'image',
        image: imageUrl
      }
    });
    
    console.log('✅ 圖片訊息發送成功!');
    return messageId;
  } catch (error) {
    console.error('❌ 圖片訊息發送失敗:', error);
    throw error;
  }
}

async function baseSendMessage({ roomId, senderId, receiverId, messageData }) {
  try {
    const messageRef = collection(db, 'chatRooms', roomId, 'messages');
    
    const messageDoc = await addDoc(messageRef, {
      ...messageData,
      senderId,
      createdAt: serverTimestamp(),
      isRead: false,
      deletedFor: [],
    });

    const roomRef = doc(db, 'chatRooms', roomId);
    const updateData = {
      lastMessage: { 
        text: messageData.text, 
        type: messageData.type, 
        senderId 
      },
      lastMessageTime: serverTimestamp(),
      [`unreadCounts.${senderId}`]: 0,
    };

    if (receiverId) {
      updateData[`unreadCounts.${receiverId}`] = increment(1);
    }

    await updateDoc(roomRef, updateData);
    return messageDoc.id;

  } catch (error) {
    console.error("發送失敗:", error);
    throw error;
  }
}

// ============================================================================
// 4. 訊息狀態管理 (保持原樣)
// ============================================================================

export async function markRoomMessagesAsRead(roomId, myUid) {
  try {
    const messagesRef = collection(db, 'chatRooms', roomId, 'messages');
    const q = query(
      messagesRef, 
      where('senderId', '!=', myUid), 
      where('isRead', '==', false)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      await updateDoc(doc(db, 'chatRooms', roomId), {
        [`unreadCounts.${myUid}`]: 0,
      }).catch(e => console.log("更新計數失敗:", e));
      return;
    }

    const batch = writeBatch(db);
    
    snapshot.forEach((msgDoc) => {
      batch.update(msgDoc.ref, { isRead: true });
    });
    
    batch.update(doc(db, 'chatRooms', roomId), {
      [`unreadCounts.${myUid}`]: 0,
    });
    
    await batch.commit();
  } catch (error) {
    console.error("標記已讀失敗:", error);
  }
}

export async function softDeleteMessage(roomId, messageId, myUid) {
  try {
    const msgRef = doc(db, 'chatRooms', roomId, 'messages', messageId);
    await updateDoc(msgRef, {
      deletedFor: arrayUnion(myUid),
    });
  } catch (error) {
    console.error("刪除訊息失敗:", error);
    throw error;
  }
}

export async function deleteConversation(roomId) {
  try {
    const messagesRef = collection(db, 'chatRooms', roomId, 'messages');
    const batchSize = 400; 
    let q = query(messagesRef, limit(batchSize));
    let snapshot = await getDocs(q);

    while (!snapshot.empty) {
      const batch = writeBatch(db);
      snapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      snapshot = await getDocs(q);
    }
    
    await updateDoc(doc(db, 'chatRooms', roomId), {
      lastMessage: {},
      unreadCounts: {}
    });
  } catch (error) {
    console.error("刪除對話失敗:", error);
    throw error;
  }
}