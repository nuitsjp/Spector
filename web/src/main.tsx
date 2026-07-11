import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('アプリケーションの表示先が見つかりません。');
}

createRoot(root).render(<App />);
