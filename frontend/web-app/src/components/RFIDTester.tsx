import React, { useState } from 'react';

/**
 * A testing widget that simulates physical JT308 RFID Scanner input.
 * It manually dispatches KeyboardEvents to simulate rapid typing.
 */
export default function RFIDTester() {
  const [rfid, setRfid] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const simulateScan = () => {
    if (!rfid) return;

    // Simulate typing each character quickly
    let timeOffset = 0;
    
    // We must focus something or just dispatch to window.
    // Our hook listens on window, so we can dispatch there.
    
    for (let i = 0; i < rfid.length; i++) {
      setTimeout(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: rfid[i], bubbles: true })
        );
      }, timeOffset);
      timeOffset += 10; // 10ms delay between keys
    }

    // Finally dispatch Enter
    setTimeout(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
      );
    }, timeOffset);
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 9999,
          background: '#6C63FF',
          color: 'white',
          border: 'none',
          borderRadius: '50px',
          padding: '10px 16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        🔌 RFID Tester
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 9999,
      background: 'var(--bg-card, white)',
      color: 'var(--text-primary, black)',
      border: '1px solid var(--border-color, #ccc)',
      borderRadius: '12px',
      padding: '16px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
      width: '260px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h4 style={{ margin: 0 }}>🔌 Test RFID Scanner</h4>
        <button 
          onClick={() => setIsOpen(false)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16 }}
        >
          ✖
        </button>
      </div>
      
      <p style={{ fontSize: 12, color: 'var(--text-secondary, gray)', marginBottom: 12 }}>
        Simulates physical JT308 scanner keyboard emulation.
      </p>

      <input 
        type="text"
        placeholder="Enter RFID ID (e.g. 1234567890)"
        value={rfid}
        onChange={(e) => setRfid(e.target.value)}
        style={{
          width: '100%',
          padding: '8px',
          marginBottom: '12px',
          borderRadius: '6px',
          border: '1px solid var(--border-color, #ccc)',
          background: 'var(--bg-input, #fff)',
          color: 'var(--text-primary, #000)',
          boxSizing: 'border-box'
        }}
      />
      <button 
        onClick={simulateScan}
        style={{
          width: '100%',
          padding: '8px',
          background: '#2E7D32',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Simulate Scan
      </button>
      
      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-secondary, gray)' }}>
        Try with: RFID-STU-001
      </div>
    </div>
  );
}
