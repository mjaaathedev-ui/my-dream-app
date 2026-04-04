// chat-persistence.ts

class ChatPersistence {
    private storageType: string;

    constructor() {
        this.storageType = this.detectStorageType();
        this.init();
    }

    detectStorageType(): string {
        if (this.supportsLocalStorage()) {
            return 'localStorage';
        } else if (this.supportsIndexedDB()) {
            return 'indexedDB';
        } else {
            throw new Error('No suitable storage available');
        }
    }

    supportsLocalStorage(): boolean {
        try {
            return 'localStorage' in window && window['localStorage'] !== null;
        } catch (e) {
            return false;
        }
    }

    supportsIndexedDB(): boolean {
        return 'indexedDB' in window;
    }

    init() {
        this.loadMessages();
        this.addVisibilityListeners();
    }

    addVisibilityListeners() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.loadMessages();
            }
        });
    }

    saveMessage(key: string, message: any) {
        const messages = this.getMessages();
        messages[key] = message;
        this.storeMessages(messages);
    }

    getMessages(): Record<string, any> {
        if (this.storageType === 'localStorage') {
            return JSON.parse(localStorage.getItem('chatMessages') || '{}');
        } else if (this.storageType === 'indexedDB') {
            return this.readFromIndexedDB();
        }
        return {};
    }

    storeMessages(messages: Record<string, any>) {
        if (this.storageType === 'localStorage') {
            localStorage.setItem('chatMessages', JSON.stringify(messages));
        } else if (this.storageType === 'indexedDB') {
            this.saveToIndexedDB(messages);
        }
    }

    saveToIndexedDB(messages: Record<string, any>) {
        console.log('Saving to IndexedDB:', messages);
    }

    readFromIndexedDB(): Record<string, any> {
        console.log('Reading from IndexedDB');
        return {};
    }

    loadMessages() {
        const messages = this.getMessages();
        console.log('Loaded messages:', messages);
    }
}

const chatPersistence = new ChatPersistence();
export default chatPersistence;
