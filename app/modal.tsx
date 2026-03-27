import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform } from 'react-native';

export default function App() {
  // 1. Setting up our "memory" (state) for messages and the text input
  const [messages, setMessages] = useState([
    { id: '1', text: 'Welcome to Apex Chat!', sender: 'bot' },
  ]);
  const [inputText, setInputText] = useState('');

  // 2. The function to handle sending a message
  const sendMessage = () => {
    if (inputText.trim() === '') return; // Prevent sending empty blank messages

    const newMessage = {
      id: Date.now().toString(), // Give the message a unique ID based on the time
      text: inputText,
      sender: 'user', // Mark it as coming from you
    };

    // Add the new message to the screen and clear the typing box
    setMessages([...messages, newMessage]);
    setInputText('');
  };

  // 3. Designing how each individual chat bubble looks
  const renderMessage = ({ item }) => (
    <View style={[styles.messageBubble, item.sender === 'user' ? styles.userBubble : styles.botBubble]}>
      <Text style={styles.messageText}>{item.text}</Text>
    </View>
  );

  // 4. Building the Layout
  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Top Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>Apex Chat</Text>
      </View>

      {/* The Scrolling List of Messages */}
      <FlatList
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatArea}
      />

      {/* The Input Box and Send Button at the bottom */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#888"
          value={inputText}
          onChangeText={setInputText} // Updates our state as you type
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// 5. The Design Rules (Colors, Padding, Bubbles)
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerText: {
    color: '#00E676',
    fontSize: 20,
    fontWeight: 'bold',
  },
  chatArea: {
    padding: 15,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 15,
    marginBottom: 10,
  },
  userBubble: {
    backgroundColor: '#00E676', // Green bubble for you
    alignSelf: 'flex-end',      // Pushes your messages to the right
    borderBottomRightRadius: 0, // Gives it a chat tail effect
  },
  botBubble: {
    backgroundColor: '#333333', // Gray bubble for others
    alignSelf: 'flex-start',    // Pushes other messages to the left
    borderBottomLeftRadius: 0,
  },
  messageText: {
    color: '#FFF',
    fontSize: 16,
  },
  inputRow: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#1E1E1E',
    borderTopWidth: 1,
    borderTopColor: '#333',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    color: '#FFF',
    padding: 12,
    borderRadius: 20,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: '#00E676',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  sendButtonText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 16,
  },
});