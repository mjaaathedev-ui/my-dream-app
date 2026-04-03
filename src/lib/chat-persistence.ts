// chat-persistence.ts

class ChatPersistence {
    constructor() {
        this.storageType = this.detectStorageType();
        this.init();
    }

    // Detect the best storage type
    detectStorageType() {
        if (this.supportsLocalStorage()) {
            return 'localStorage';
        } else if (this.supportsIndexedDB()) {
            return 'indexedDB';
        } else {
            throw new Error('No suitable storage available');
        }
    }

    supportsLocalStorage() {
        try {
            return 'localStorage' in window && window['localStorage'] !== null;
        } catch (e) {
            return false;
        }
    }

    supportsIndexedDB() {
        return 'indexedDB' in window;
    }

    init() {
        // Load existing messages on init
        this.loadMessages();
        // Add visibility listeners
        this.addVisibilityListeners();
    }

    addVisibilityListeners() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.loadMessages();
            }
        });
    }

    saveMessage(key, message) {
        const messages = this.getMessages();
        messages[key] = message;
        this.storeMessages(messages);
    }

    getMessages() {
        if (this.storageType === 'localStorage') {
            return JSON.parse(localStorage.getItem('chatMessages')) || {};
        } else if (this.storageType === 'indexedDB') {
            // IndexedDB read logic
            return this.readFromIndexedDB();
        }
    }

    storeMessages(messages) {
        if (this.storageType === 'localStorage') {
            localStorage.setItem('chatMessages', JSON.stringify(messages));
        } else if (this.storageType === 'indexedDB') {
            this.saveToIndexedDB(messages);
        }
    }

    // Sample IndexedDB methods (these would need to be implemented properly)
    saveToIndexedDB(messages) {
        // Implementation for saving to IndexedDB
        console.log('Saving to IndexedDB:', messages);
    }

    readFromIndexedDB() {
        // Implementation for reading from IndexedDB
        console.log('Reading from IndexedDB');
        return {};
    }

    loadMessages() {
        const messages = this.getMessages();
        console.log('Loaded messages:', messages);
        // Logic to display messages in the chat UI
    }
}

const chatPersistence = new ChatPersistence();

// Exporting the class for use in other modules
export default chatPersistence;
