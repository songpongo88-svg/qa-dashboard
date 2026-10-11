import { useEffect, useRef, useState } from 'react';
import { fetchStoredProfilePhoto } from './profilePhotoStore';

/** Share one profile read between the roster avatar and the selected Admin. */
export default function useCoachingProfilePhotos(usernamesKey: string) {
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const loaded = useRef(new Set<string>());
  const versions = useRef(new Map<string, number>());
  useEffect(() => {
    let active = true;
    const usernames: string[] = JSON.parse(usernamesKey);
    const refresh = async (username: string) => {
      const version = (versions.current.get(username) || 0) + 1;
      versions.current.set(username, version);
      const photo = await fetchStoredProfilePhoto(username).catch(() => null);
      if (!active || versions.current.get(username) !== version) return;
      loaded.current.add(username);
      setPhotos(current => ({ ...current, [username]: photo?.photoDataUrl || '' }));
    };
    usernames.filter(username => !loaded.current.has(username)).forEach(username => { void refresh(username); });
    const updated = (event: Event) => {
      const username = String((event as CustomEvent<{ username?: string }>).detail?.username || '');
      const visible = usernames.find(item => item.toLowerCase() === username.toLowerCase());
      if (visible) void refresh(visible);
    };
    const storage = (event: StorageEvent) => {
      const visible = usernames.find(username => event.key === `qa-dashboard:profile-photo:${username.trim().replace(/\//g, '__').replace(/\s+/g, ' ').toLowerCase()}`);
      if (visible) void refresh(visible);
    };
    window.addEventListener('qa-profile-photo-updated', updated);
    window.addEventListener('storage', storage);
    return () => { active = false;window.removeEventListener('qa-profile-photo-updated', updated);window.removeEventListener('storage', storage); };
  }, [usernamesKey]);
  return photos;
}
