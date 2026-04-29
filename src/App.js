import React, { useState, useRef, useEffect } from "react";
import Webcam from "react-webcam";
import RecordRTC from "recordrtc";
import "./App.css";

function App() {
  const [status, setStatus] = useState("Initializing");
  const [isBackendReady, setIsBackendReady] = useState(false);
  const [chunks, setChunks] = useState([]);
  const [finalBPM, setFinalBPM] = useState(null);
  const webcamRef = useRef(null);

  useEffect(() => {
    const checkServer = async () => {
      try {
        const response = await fetch("http://localhost:8000/api/health");
        if (response.ok) {
          setIsBackendReady(true);
          setStatus("Ready");
        } else {
          setTimeout(checkServer, 2000);
        }
      } catch (e) {
        setTimeout(checkServer, 2000);
      }
    };
    checkServer();
  }, []);

  const startAnalysis = async () => {
    if (!isBackendReady) return;

    setChunks([]);
    setFinalBPM(null);
    setStatus("Analyzing");

    let chunkCount = 0;
    const maxChunks = 12;

    const captureLoop = async () => {
      if (chunkCount >= maxChunks) {
        setStatus("Finished");
        return;
      }

      if (!webcamRef.current?.stream) return;

      const stream = webcamRef.current.stream;
      const recorder = new RecordRTC(stream, {
        type: "video",
        mimeType: "video/webm",
      });

      recorder.startRecording();

      setTimeout(() => {
        recorder.stopRecording(async () => {
          const blob = recorder.getBlob();
          sendToBackend(blob, chunkCount + 1);
          chunkCount++;
          captureLoop();
        });
      }, 5000);
    };

    captureLoop();
  };

  const sendToBackend = async (blob, id) => {
    const formData = new FormData();
    formData.append("video", blob, `chunk_${id}.webm`);

    try {
      const response = await fetch("http://localhost:8000/api/analyze", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      setChunks((prev) => [...prev, { id, ...data }]);
    } catch (error) {
      console.error("Inference Error:", error);
    }
  };

  useEffect(() => {
    if (chunks.length === 12) {
      const avg = chunks.reduce((acc, c) => acc + c.bpm, 0) / 12;
      setFinalBPM(avg.toFixed(2));
    }
  }, [chunks]);

  const latest = chunks.length > 0 ? chunks[chunks.length - 1] : null;

  return (
    <div className="container">
      <header>
        <h1>
          rPPG <span className="highlight">Vital Monitor</span>
        </h1>
        <p className="subtitle">
          Remote Heart Rate Estimation via Computer Vision
        </p>
      </header>

      <div className="main-layout">
        <div className="webcam-container">
          <Webcam ref={webcamRef} mirrored muted className="webcam-feed" />

          {/* Enhanced Status Overlays */}
          {!isBackendReady && (
            <div className="backend-loader">
              <div className="spinner"></div>
              <p>Waking up Backend & Loading Models...</p>
            </div>
          )}

          {status === "Analyzing" && (
            <div className="recording-status">
              <span className="dot"></span> RECORDING CHUNK {chunks.length + 1}
              /12
            </div>
          )}
        </div>

        <div className="stats-grid">
          {/* ... existing stats-grid code ... */}
          <div className="stat-card">
            <div className="stat-label">Heart Rate</div>
            <div className="stat-value">
              {latest ? latest.bpm.toFixed(1) : "--"} <small>BPM</small>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Signal Quality</div>
            <div className="stat-value">
              {latest ? (latest.quality * 100).toFixed(0) : "--"}%
            </div>
          </div>
          <div className="stat-card highlight-card">
            <div className="stat-label">60s Average</div>
            <div className="stat-value">{finalBPM || "--"}</div>
          </div>
        </div>
      </div>

      <div className="controls">
        <button
          onClick={startAnalysis}
          className={`btn-primary ${!isBackendReady ? "disabled" : ""}`}
          disabled={!isBackendReady || status === "Analyzing"}
        >
          {!isBackendReady
            ? "Connecting to Backend..."
            : status === "Finished"
              ? "Analyze Again"
              : "Start Full Analysis"}
        </button>
      </div>

      <div className="log-section">
        <h3>Session Logs</h3>
        <div className="log-table">
          <div className="log-header">
            <span>CHUNK</span>
            <span>BPM</span>
            <span>RESP. RATE</span>
            <span>LATENCY</span>
            <span>SIGNAL</span>
          </div>
          {chunks.map((c) => (
            <div key={c.id} className="log-row">
              <span>#{c.id}</span>
              <span>{c.bpm.toFixed(2)}</span>
              <span>{c.rr.toFixed(1)}</span>
              <span>{c.latency}</span>
              <span
                className={c.quality > 0.4 ? "quality-good" : "quality-low"}
              >
                {c.quality > 0.4 ? "Stable" : "Weak"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
