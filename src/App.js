import React, { useState, useRef, useEffect, useCallback } from "react";
import Webcam from "react-webcam";
import RecordRTC from "recordrtc";
import "./App.css";

function App() {
  const [status, setStatus] = useState("Initializing");
  const [isBackendReady, setIsBackendReady] = useState(false);
  const [chunks, setChunks] = useState([]);

  // Real-time states for the client's requirements
  const [aggregateBPM, setAggregateBPM] = useState("--");
  const [currentBPM, setCurrentBPM] = useState("--");

  const isRecordingRef = useRef(false);
  const webcamRef = useRef(null);
  const recorderRef = useRef(null);

  // Connection Guard
  useEffect(() => {
    const checkServer = async () => {
      try {
        const response = await fetch("http://localhost:8000/api/health");
        if (response.ok) {
          setIsBackendReady(true);
          setStatus("System Ready");
        } else {
          setTimeout(checkServer, 2000);
        }
      } catch (e) {
        setTimeout(checkServer, 2000);
      }
    };
    checkServer();
  }, []);

  const stopAnalysis = useCallback(() => {
    isRecordingRef.current = false;
    if (recorderRef.current) recorderRef.current.stopRecording();
    setStatus("Stopped");
  }, []);

  const resetAnalysis = () => {
    stopAnalysis();
    setChunks([]);
    setAggregateBPM("--");
    setCurrentBPM("--");
    setStatus("System Ready");
  };

  const startAnalysis = async () => {
    if (!isBackendReady || isRecordingRef.current) return;

    resetAnalysis();
    setStatus("Analyzing...");
    isRecordingRef.current = true;

    let chunkCount = 0;
    const captureLoop = async () => {
      if (chunkCount >= 12 || !isRecordingRef.current) {
        if (chunkCount >= 12) setStatus("Session Complete");
        isRecordingRef.current = false;
        return;
      }

      const stream = webcamRef.current?.stream;
      if (!stream) return;

      recorderRef.current = new RecordRTC(stream, {
        type: "video",
        mimeType: "video/webm",
      });
      recorderRef.current.startRecording();

      setTimeout(() => {
        if (!isRecordingRef.current) return;
        recorderRef.current.stopRecording(async () => {
          const blob = recorderRef.current.getBlob();
          await sendToBackend(blob, chunkCount + 1);
          chunkCount++;
          captureLoop();
        });
      }, 5000); // 5-second chunk windows
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

      // Extract metrics returned from backend
      setChunks((prev) => [...prev, { id, ...data }]);
      setCurrentBPM(data.chunk_bpm > 0 ? data.chunk_bpm : "--");
      setAggregateBPM(data.aggregate_bpm > 0 ? data.aggregate_bpm : "--");
    } catch (e) {
      console.error("Inference Error:", e);
    }
  };

  if (!isBackendReady) {
    return (
      <div className="loader-screen">
        <div className="pulse-loader"></div>
        <h1>RPPG PROTOTYPE</h1>
        <p>Connecting to AI Pipeline...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="top-nav">
        <div className="brand">
          RPPG<span>PROTOTYPE</span>
        </div>
        <div
          className={`status-tag ${status.includes("Ready") || status.includes("Complete") ? "ready" : "active"}`}
        >
          {status}
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Left: Camera Feed */}
        <div className="viewport-section">
          <div className="webcam-wrapper">
            <Webcam ref={webcamRef} mirrored muted className="video-surface" />
            <div className="scanline"></div>
            <div className="overlay-instruction">
              {status === "Analyzing..."
                ? "CAPTURING 5S CHUNKS..."
                : "ALIGN FACE TO START"}
            </div>
          </div>

          <div className="control-center">
            {status === "Analyzing..." ? (
              <button onClick={stopAnalysis} className="btn stop">
                STOP SCAN
              </button>
            ) : (
              <button
                onClick={startAnalysis}
                className="btn start"
                disabled={!isBackendReady}
              >
                START 60s SCAN
              </button>
            )}
            <button onClick={resetAnalysis} className="btn reset">
              RESET
            </button>
          </div>
        </div>

        {/* Right: Real-time Data Metrics */}
        <div className="metrics-section">
          {/* Top Aggregate Cards */}
          <div className="cards-row">
            <div className="metric-card">
              <div className="label">Current Chunk (5s)</div>
              <div className="value-group">
                <span className="big-value">{currentBPM}</span>
                <span className="unit">BPM</span>
              </div>
            </div>
            <div className="metric-card active-card">
              <div className="label">Overall Aggregate (60s)</div>
              <div className="value-group">
                <span className="big-value highlight">{aggregateBPM}</span>
                <span className="unit">BPM</span>
              </div>
            </div>
          </div>

          {/* Client Requirement: Data Log Table */}
          <div className="mini-log">
            <div className="log-header">
              <span className="col-id">ID</span>
              <span className="col-bpm">CHUNK BPM</span>
              <span className="col-rr">RR</span>
              <span className="col-lat">LATENCY</span>
              <span className="col-qual">QUALITY</span>
            </div>
            <div className="log-scroll">
              {chunks.length === 0 && (
                <div className="empty-log">Awaiting pipeline data...</div>
              )}
              {chunks.map((c) => (
                <div key={c.id} className="log-entry">
                  <span className="col-id">#{c.id}</span>
                  <span className="col-bpm">
                    {c.chunk_bpm > 0 ? c.chunk_bpm : "---"}
                  </span>
                  <span className="col-rr">{c.rr > 0 ? c.rr : "---"}</span>
                  <span className="col-lat">{c.latency}</span>
                  <span
                    className={`col-qual ${c.quality > 50 ? "good" : "bad"}`}
                  >
                    {c.quality}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
