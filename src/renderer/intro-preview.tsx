import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { IntroAnimation } from './components/IntroAnimation';
import './styles.css';

function Preview() {
  const [run, setRun] = useState(0);
  const restart = () => setRun((value) => value + 1);

  useEffect(() => {
    const restartWithKeyboard = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'r') restart();
    };
    window.addEventListener('keydown', restartWithKeyboard);
    return () => window.removeEventListener('keydown', restartWithKeyboard);
  }, []);

  return <div className="intro-preview" onClick={restart} title="Zum Wiederholen klicken">
    <IntroAnimation key={run}/>
    <button className="intro-preview__restart" type="button" onClick={(event) => { event.stopPropagation(); restart(); }}>
      <span aria-hidden="true">↻</span> Animation neu starten <kbd>R</kbd>
    </button>
  </div>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Preview/></React.StrictMode>
);
