import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  Alert, KeyboardAvoidingView, Platform, StyleSheet
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// 引入 Firebase 相關
import { auth } from '../firebaseConfig';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { createUser } from '../firestoreSchema';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

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
    } catch (e) {
      Alert.alert('錯誤', e.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.centerContainer}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ width: '100%', alignItems: 'center' }}
      >
        <Text style={styles.title}>{isLoginMode ? 'Chat App 登入' : '註冊新帳號'}</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TextInput
          style={styles.input}
          placeholder="密碼"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {!isLoginMode && (
          <TextInput
            style={styles.input}
            placeholder="暱稱"
            value={displayName}
            onChangeText={setDisplayName}
          />
        )}

        <TouchableOpacity style={styles.btn} onPress={handleAuthAction} disabled={isLoading}>
           {isLoading ? (
             <ActivityIndicator color="#fff"/>
           ) : (
             <Text style={styles.btnText}>{isLoginMode ? '登入' : '註冊'}</Text>
           )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsLoginMode(!isLoginMode)} style={{marginTop:20}}>
          <Text style={{color:'#007AFF'}}>
            {isLoginMode ? '還沒有帳號? 去註冊' : '已有帳號? 去登入'}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// 這是專屬於 LoginScreen 的樣式
const styles = StyleSheet.create({
  centerContainer: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: { backgroundColor: '#f0f0f0', padding: 15, borderRadius: 10, marginBottom: 10, width: '100%' },
  btn: { backgroundColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10, width: '100%' },
  btnText: { color: '#fff', fontWeight: 'bold' },
});
