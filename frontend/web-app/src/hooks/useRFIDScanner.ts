import { useEffect, useRef } from 'react';

/**
 * A hook to detect rapid keyboard input simulating an RFID scan.
 * Hardware RFID scanners typically act as keyboard emulators, typing the ID
 * very quickly and appending an "Enter" keystroke.
 *
 * @param onScan Callback function triggered when a full scan is detected.
 * @param timeoutMs The maximum delay between keystrokes to consider it a scan (default 50ms).
 */
export function useRFIDScanner(onScan: (scannedId: string) => void, timeoutMs: number = 50) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if a modifier key is pressed
      if (e.ctrlKey || e.altKey || e.metaKey) {
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
          onScan(bufferRef.current);
          bufferRef.current = ''; // Clear after successful scan
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
  }, [onScan, timeoutMs]);
}
