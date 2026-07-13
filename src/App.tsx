import { RestorationScroll } from './components/RestorationScroll';
import './App.css';

export default function App() {
  return (
    <>
      <header className="site-header">
        <div className="site-logo">Dino 246 GT</div>
        <div className="site-subtitle">Restoration</div>
      </header>
      <main>
        <RestorationScroll />
      </main>
    </>
  );
}
