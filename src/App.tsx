import { useEffect, useState } from 'react';
import { AdminApp } from './components/AdminApp';
import { ProjectorView } from './components/ProjectorView';
import { Toasts } from './components/ui';

const isProjectorHash = () => window.location.hash.startsWith('#/projector');

/** Room code from `#/projector?room=CODE` (projector laptop following a live room). */
const projectorRoom = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('room');

export default function App() {
  const [projector, setProjector] = useState(isProjectorHash);
  const [room, setRoom] = useState(projectorRoom);
  useEffect(() => {
    const onHash = () => {
      setProjector(isProjectorHash());
      setRoom(projectorRoom());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return (
    <>
      {projector ? <ProjectorView room={room} key={room ?? 'local'} /> : <AdminApp />}
      <Toasts />
    </>
  );
}
