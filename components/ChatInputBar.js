import React from 'react';
import { View, TextInput, TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';

export default function ChatInputBar({ 
  inputText, 
  setInputText, 
  onSend, 
  onPickImage, 
  isLoading 
}) {
  return (
    <View style={styles.inputBar}>
      <TouchableOpacity
        onPress={onPickImage}
        style={styles.iconBtn}
        disabled={isLoading}
      >
        <Text style={{ fontSize: 24 }}>{isLoading ? '⏳' : '📷'}</Text>
      </TouchableOpacity>
      
      <TextInput
        style={styles.inputMsg}
        value={inputText}
        onChangeText={setInputText}
        placeholder="輸入訊息..."
        multiline
        editable={!isLoading}
      />
      
      <TouchableOpacity 
        onPress={onSend} 
        style={styles.sendBtn} 
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.sendBtnText}>發送</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  inputBar: { flexDirection: 'row', padding: 10, borderTopWidth: 1, borderColor: '#eee', alignItems: 'center', backgroundColor: '#fff' },
  iconBtn: { marginRight: 10 },
  inputMsg: { flex: 1, backgroundColor: '#f0f0f0', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 8, marginRight: 10, fontSize: 16, maxHeight: 100 },
  sendBtn: { backgroundColor: '#007AFF', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  sendBtnText: { color: '#fff', fontWeight: 'bold' },
});