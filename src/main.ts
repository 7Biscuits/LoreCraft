import './styles.css';
import { startGame } from './game';

startGame();

// LittleJS owns global canvas, input, and animation-loop state, so reload on HMR.
if (import.meta.hot) {
  import.meta.hot.accept(() => location.reload());
}
