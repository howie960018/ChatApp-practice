import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';

export default function MessageBubble({ currentMessage, isMe, onLongPress }) {
  // 處理時間顯示的輔助函式
  const formatTime = (timestamp) => {
    if (!timestamp) return '...';
    return new Date(timestamp.seconds * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <TouchableOpacity
      onLongPress={onLongPress}
      activeOpacity={0.8}
      style={[
        styles.msgRow,
        isMe ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' },
      ]}
    >
      <View
        style={[
          styles.msgBubble,
          isMe ? styles.msgBubbleMe : styles.msgBubbleOther,
        ]}
      >
        {currentMessage.type === 'image' ? (
          <Image
            source={{ uri: currentMessage.image }}
            style={styles.msgImage}
            resizeMode="cover"
          />
        ) : (
          <Text style={isMe ? styles.textMe : styles.textOther}>
            {currentMessage.text}
          </Text>
        )}
        
        <View style={styles.metaContainer}>
          <Text style={styles.timeText}>
            {formatTime(currentMessage.createdAt)}
          </Text>
          {isMe && (
            <Text style={styles.readStatus}>
              {currentMessage.isRead ? '已讀' : '未讀'}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// 把原本 App.js 下方相關的 Style 剪下貼過來
const styles = StyleSheet.create({
  msgRow: { marginVertical: 5, flexDirection: 'row' },
  msgBubble: { padding: 10, borderRadius: 15, maxWidth: '75%' },
  msgBubbleMe: { backgroundColor: '#007AFF', borderBottomRightRadius: 2 },
  msgBubbleOther: { backgroundColor: '#f0f0f0', borderBottomLeftRadius: 2 },
  msgImage: { width: 200, height: 150, borderRadius: 10 }, // 新增這個樣式讓圖片整齊
  textMe: { color: '#fff', fontSize: 16 },
  textOther: { color: '#000', fontSize: 16 },
  metaContainer: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  timeText: { fontSize: 10, color: '#ddd', alignSelf: 'flex-end' },
  readStatus: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginLeft: 4 },
});