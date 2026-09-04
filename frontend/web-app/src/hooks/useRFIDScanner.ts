import { useEffect, useRef } from 'react';
import { useRFIDStore } from '../store/rfidStore';

/**
 * A hook to detect rapid keyboard input simulating an RFID scan.
 * Hardware RFID scanners typically act as keyboard emulators, typing the ID
 * very quickly and appending an "Enter" keystroke.
 *
 * @param onGlobalScan Callback function triggered when a full scan is detected and no specific page is handling it.
 * @param timeoutMs The maximum delay between keystrokes to consider it a scan (default 50ms).
 */
export function useRFIDScanner(onGlobalScan?: (scannedId: string) => void, timeoutMs: number = 50) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const { setPlugged, activeHandler } = useRFIDStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if a modifier key is pressed, or focus is inside an input/textarea
      if (e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }
      
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      const currentTime = new Date().getTime();

      // If the time between this key and the last key is too long,
      // it's probably normal typing, so reset the buffer.
      if (currentTime - lastKeyTimeRef.current > timeoutMs) {
        bufferRef.current = '';
      }

      // Hardware scanners typically end the input with an Enter key
      if (e.key === 'Enter') {
        if (bufferRef.current.length > 0) {
          setPlugged(true);
          const rfid = bufferRef.current;
          bufferRef.current = ''; // Clear after successful scan

          if (activeHandler) {
            activeHandler(rfid);
          } else if (onGlobalScan) {
            onGlobalScan(rfid);
          }
        }
      } 
      // If it's a standard printable character (length === 1), append to buffer
      else if (e.key.length === 1) {
        bufferRef.current += e.key;
      }

      lastKeyTimeRef.current = currentTime;
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onGlobalScan, timeoutMs, setPlugged, activeHandler]);
}
