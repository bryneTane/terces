import { AppView } from './App.tsx';
import { usePipeline } from './state/usePipeline.ts';

export function App() {
  return <AppView pipeline={usePipeline()} />;
}
