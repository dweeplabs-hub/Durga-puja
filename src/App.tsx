import { useEffect, useState } from 'react';
import { AdminApp } from './components/AdminApp';
import { ProjectorView } from './components/ProjectorView';
import { Toasts } from './components/ui';

const isProjectorHash = () => window.location.hash.startsWith('#/projector');

export default function App() {
  const [projector, setProjector] = useState(isProjectorHash);
  useEffect(() => {
    const onHash = () => setProjector(isProjectorHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return (
    <>
      {projector ? <ProjectorView /> : <AdminApp />}
      <Toasts />
    </>
  );
}
