import React, { useEffect, useState, useRef } from "react";
import JsSIP from "jssip";
JsSIP.debug.enable("JsSIP:*");
const LOCAL_STORAGE_KEY = "webrtc_extensions";
const CALL_LOG_KEY = "webrtc_call_logs";
const defaultExtensions = [
  { number: "9008", label: "SIP Phone", status: "online" },
  { number: "93017", label: "Zenitel", status: "offline" },
  { number: "9002", label: "Operator", status: "online" },
  { number: "9003", label: "Security", status: "offline" },
];
const WebRTCPhone = () => {
  const [ua, setUa] = useState(null);
  const [session, setSession] = useState(null);
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState("🔴 Offline");
  const [incomingSession, setIncomingSession] = useState(null);
  const [caller, setCaller] = useState("");
  const [callStartTime, setCallStartTime] = useState(null);
  const [callDuration, setCallDuration] = useState("00:00");
  const [editMode, setEditMode] = useState(false);
  const [extensions, setExtensions] = useState(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    return stored ? JSON.parse(stored) : defaultExtensions;
  });
  const [showLogs, setShowLogs] = useState(false);
  const [callLogs, setCallLogs] = useState(() => {
    const stored = localStorage.getItem(CALL_LOG_KEY);
    return stored ? JSON.parse(stored) : [];
  });
  const [newExt, setNewExt] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const durationInterval = useRef(null);
  const ringtoneRef = useRef(null);
  const remoteAudioRef = useRef(null);
  useEffect(() => {
    const socket = new JsSIP.WebSocketInterface("wss://10.30.250.50:8089/ws");
    const configuration = {
      sockets: [socket],
      uri: "sip:9001@10.30.250.50",
      password: "1234",
      display_name: "WebRTC Client",
      session_timers: false,
      register: true,
    };
    const userAgent = new JsSIP.UA(configuration);
    setUa(userAgent);
    userAgent.start();
    userAgent.on("registered", () => setStatus("🟢 Online"));
    userAgent.on("registrationFailed", () => setStatus("🔴 Offline"));
    userAgent.on("disconnected", () => setStatus("🔴 Offline"));
    userAgent.on("newRTCSession", ({ originator, session }) => {
      if (originator === "remote") {
        setCaller(session.remote_identity.uri.toString());
        setIncomingSession(session);
        ringtoneRef.current?.play();
        attachRemoteStream(session);
        sessionEvents(session, session.remote_identity.uri.user, "Me");
      }
    });
    return () => userAgent.stop();
  }, []);
  const attachRemoteStream = (session) => {
    session.connection.addEventListener("track", (e) => {
      if (remoteAudioRef.current && e.streams.length > 0) {
        remoteAudioRef.current.srcObject = e.streams[0];
      }
    });
  };
  const sessionEvents = (session, from, to) => {
    session.on("accepted", () => {
      setStatus("📞 In Call");
      stopRingtone();
      const now = Date.now();
      setCallStartTime(now);
      startTimer(now);
    });
    session.on("ended", () => {
      const duration = callDuration;
      logCall({ from, to, duration });
      endCall();
    });
    session.on("failed", () => {
      const duration = callDuration;
      logCall({ from, to, duration });
      endCall();
    });
  };
  const logCall = ({ from, to, duration }) => {
    const log = {
      from,
      to,
      duration,
      timestamp: new Date().toLocaleString(),
    };
    const updatedLogs = [log, ...callLogs];
    setCallLogs(updatedLogs);
    localStorage.setItem(CALL_LOG_KEY, JSON.stringify(updatedLogs));
  };
  const startTimer = (startTime) => {
    stopTimer();
    durationInterval.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - startTime) / 1000);
      const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
      const secs = String(seconds % 60).padStart(2, "0");
      setCallDuration(`${mins}:${secs}`);
    }, 1000);
  };
  const stopTimer = () => {
    clearInterval(durationInterval.current);
    setCallDuration("00:00");
    setCallStartTime(null);
  };
  const stopRingtone = () => {
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
  };
  const endCall = () => {
    stopTimer();
    stopRingtone();
    setStatus("🟢 Online");
    setIncomingSession(null);
    setSession(null);
    setCaller("");
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  };
  const handleCall = () => {
    if (!ua || !ua.isRegistered()) return alert("❌ SIP not connected.");
    if (!target) return alert("Select an extension!");
    setStatus(`📲 Dialing ${target}...`);
    const newSession = ua.call(`sip:${target}@10.30.250.50`, {
      mediaConstraints: { audio: true, video: false },
    });
    attachRemoteStream(newSession);
    sessionEvents(newSession, "Me", target);
    setSession(newSession);
  };
  const handleAnswer = () => {
    if (!incomingSession) return;
    incomingSession.answer({ mediaConstraints: { audio: true, video: false } });
    attachRemoteStream(incomingSession);
    sessionEvents(incomingSession, caller, "Me");
    setSession(incomingSession);
    setIncomingSession(null);
  };
  const handleReject = () => {
    incomingSession?.terminate();
    stopRingtone();
    setIncomingSession(null);
  };
  const handleHangup = () => {
    session?.terminate();
    endCall();
  };
  const handleEditLabel = (index, newLabel) => {
    const updated = [...extensions];
    updated[index].label = newLabel;
    setExtensions(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  };
  const handleAddExtension = () => {
    if (!newExt || !newLabel) return;
    const updated = [...extensions, { number: newExt, label: newLabel, status: "offline" }];
    setExtensions(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    setNewExt("");
    setNewLabel("");
  };
  const handleDeleteExtension = (number) => {
    const updated = extensions.filter(ext => ext.number !== number);
    setExtensions(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    if (target === number) setTarget("");
  };
  return (
    <>
      <div style={{
        position: "fixed", top: 10, right: 10, background: "#fff",
        padding: "12px 20px", boxShadow: "0 3px 12px rgba(0,0,0,0.1)",
        borderRadius: "12px", display: "flex", alignItems: "center",
        gap: 12, zIndex: 9999, fontFamily: "Arial"
      }}>
        <span style={{
          padding: "5px 12px", background: "#eee", borderRadius: 10,
          fontWeight: 600, fontSize: 14
        }}>{status}</span>
        <button onClick={() => setEditMode(!editMode)} style={{
          fontSize: 13, padding: "4px 8px", background: "#f0f0f0",
          border: "1px solid #ccc", borderRadius: "6px", cursor: "pointer"
        }}>
          {editMode ? "✅" : "✏️"}
        </button>
        {!editMode ? (
          <select value={target} onChange={(e) => setTarget(e.target.value)} style={{
            padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14
          }}>
            <option value="">Select Extension</option>
            {extensions.map(ext => (
              <option key={ext.number} value={ext.number}>
                {ext.number} - {ext.label}
              </option>
            ))}
          </select>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {extensions.map((ext, i) => (
              <div key={ext.number} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <b>{ext.number}</b>
                <input type="text" value={ext.label} onChange={(e) => handleEditLabel(i, e.target.value)}
                       style={{ padding: "4px 8px", border: "1px solid #ccc", borderRadius: 6 }} />
                <button onClick={() => handleDeleteExtension(ext.number)} style={{
                  background: "#ff4d4f", color: "#fff", border: "none",
                  borderRadius: 6, padding: "2px 8px", cursor: "pointer"
                }}>🗑️</button>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input placeholder="Ext" value={newExt} onChange={(e) => setNewExt(e.target.value)}
                     style={{ padding: "4px 6px", width: 60, border: "1px solid #ccc", borderRadius: 6 }} />
              <input placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                     style={{ padding: "4px 6px", width: 120, border: "1px solid #ccc", borderRadius: 6 }} />
              <button onClick={handleAddExtension} style={{
                padding: "4px 10px", background: "#4caf50", color: "#fff",
                border: "none", borderRadius: 6, cursor: "pointer"
              }}>➕ Add</button>
            </div>
          </div>
        )}
        {status === "📞 In Call" && (
          <div style={{
            fontSize: 14, fontWeight: "bold", padding: "6px 12px",
            background: "#f7f7f7", borderRadius: 8, border: "1px solid #ddd"
          }}>
            ⏱ {callDuration}
          </div>
        )}
        <img src="/call.png" alt="Call" onClick={handleCall}
             style={{ width: 35, height: 35, cursor: "pointer" }} />
        <img src="/hangup.png" alt="Hangup" onClick={handleHangup}
             style={{ width: 35, height: 35, cursor: "pointer" }} />
        <button onClick={() => setShowLogs(!showLogs)} style={{
          background: "#f9f9f9", border: "1px solid #ddd", padding: "6px 12px",
          borderRadius: 6, cursor: "pointer", fontWeight: "bold"
        }}>
          📜 Call Logs
        </button>
      </div>
      {showLogs && (
        <div style={{
          position: "fixed", top: 70, right: 10, background: "#fff",
          padding: 16, boxShadow: "0 3px 10px rgba(0,0,0,0.15)",
          borderRadius: 10, width: 280, fontFamily: "Arial", maxHeight: 300, overflowY: "auto"
        }}>
          <h4 style={{ margin: 0, marginBottom: 10 }}>📋 Call Logs</h4>
          {callLogs.length === 0 && <p>No calls yet.</p>}
          {callLogs.map((log, i) => (
            <div key={i} style={{ marginBottom: 12, borderBottom: "1px solid #eee", paddingBottom: 6 }}>
              <div><b>{log.from}</b> ➡️ <b>{log.to}</b></div>
              <div>⏱ {log.duration}</div>
              <div>🕒 {log.timestamp}</div>
            </div>
          ))}
        </div>
      )}
      {incomingSession && (
        <div style={{
          position: "fixed", top: 100, right: 20, background: "#fff",
          padding: 16, boxShadow: "0 2px 6px rgba(0,0,0,0.2)", borderRadius: 10
        }}>
          <p>📞 Incoming call from: <strong>{caller}</strong></p>
          <button onClick={handleAnswer} style={{ marginRight: 10 }}>✅ Answer</button>
          <button onClick={handleReject}>❌ Reject</button>
        </div>
      )}
      <audio ref={remoteAudioRef} autoPlay />
      <audio ref={ringtoneRef} src="/ringtone.mp3" loop preload="auto" />
    </>
  );
};
export default WebRTCPhone;

