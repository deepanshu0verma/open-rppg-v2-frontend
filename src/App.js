import React, { useState, useRef, useEffect } from "react";
import Webcam from "react-webcam";
import RecordRTC from "recordrtc";
import "./App.css";

function App() {
  const [status, setStatus] = useState("Initializing");
  const [isBackendReady, setIsBackendReady] = useState(false);
  const [chunks, setChunks] = useState([]);
  const [finalBPM, setFinalBPM] = useState(null);
  const [displayBPM, setDisplayBPM] = useState(0);
  const webcamRef = useRef(null);

  // 1. Backend Health Check
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

  // 2. SMART FINAL CALCULATION (Median Filter)
  // This hook runs every time 'chunks' updates.
  // When it hits 12, it calculates the most realistic result.
  useEffect(() => {
    if (chunks.length === 12) {
      // Filter for chunks that aren't invalid and have a human BPM (45-120)
      const validPoints = chunks
        .filter((c) => !c.isInvalid && c.bpm > 45 && c.bpm < 130)
        .map((c) => c.bpm);

      if (validPoints.length > 0) {
        // MEDIAN FILTER: Sort and pick the middle value to ignore spikes
        validPoints.sort((a, b) => a - b);
        const middleIndex = Math.floor(validPoints.length / 2);
        const medianBPM = validPoints[middleIndex];
        setFinalBPM(medianBPM.toFixed(1));
      } else {
        setFinalBPM("Inconclusive");
      }
    }
  }, [chunks]);

  const startAnalysis = async () => {
    setChunks([]);
    setFinalBPM(null);
    setDisplayBPM(0);
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
          await sendToBackend(blob, chunkCount + 1);
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

      let isInvalid = data.quality < 0.1;
      if (data.box && webcamRef.current) {
        const videoEl = webcamRef.current.video;
        const faceCenterX =
          ((data.box.xmin + data.box.xmin_max) / 2) *
          (videoEl.clientWidth / 128);
        if (Math.abs(faceCenterX - videoEl.clientWidth / 2) > 250) {
          isInvalid = true;
        }
      }

      const chunkResult = { ...data, isInvalid };
      setChunks((prev) => [...prev, { id, ...chunkResult }]);

      if (!chunkResult.isInvalid) {
        setDisplayBPM(data.bpm);
      }
    } catch (error) {
      console.error("Inference Error:", error);
    }
  };

  const latest = chunks.length > 0 ? chunks[chunks.length - 1] : null;

  // IMPORTANT: All hooks are above this line.
  if (!isBackendReady) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
        <h2>Initializing AI Models...</h2>
        <p>Connecting to Python Backend Server</p>
      </div>
    );
  }

  return (
    <div className="container">
      <header>
        <h1>
          rPPG <span className="highlight">Vital Monitor</span>
        </h1>
        <p className="subtitle">Stable Biometric Estimation</p>
      </header>

      <div className="main-layout">
        <div className="webcam-wrapper">
          <Webcam ref={webcamRef} mirrored muted className="webcam-feed" />
          <div className="camera-overlay"></div>
          <div className="face-guideline"></div>
          <div className={`overlay-text ${latest?.isInvalid ? "warning" : ""}`}>
            {status === "Analyzing"
              ? latest?.isInvalid
                ? "Movement Detected - Stay Still"
                : "Scanning Vitals..."
              : status === "Finished"
                ? "Scan Complete"
                : "Align Face to Start"}
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Heart Rate</div>
            <div className="stat-value">
              {displayBPM > 0 ? Math.round(displayBPM) : "--"}{" "}
              <small>BPM</small>
            </div>
          </div>
          <div className="stat-card highlight-card">
            <div className="stat-label">Session Median</div>
            <div className="stat-value">{finalBPM || "--"}</div>
          </div>
        </div>
      </div>

      <div className="controls">
        <button
          onClick={startAnalysis}
          className="btn-primary"
          disabled={status === "Analyzing"}
        >
          {status === "Analyzing"
            ? `Progress: ${chunks.length}/12`
            : "Start 60s Scan"}
        </button>
      </div>

      <div className="log-section">
        <h3>Analysis Log</h3>
        <div className="log-table">
          <div className="log-header">
            <span>CHUNK</span>
            <span>BPM</span>
            <span>RESP.</span>
            <span>LATENCY</span>
            <span>STATUS</span>
          </div>
          {chunks.map((c) => (
            <div key={c.id} className="log-row">
              <span>#{c.id}</span>
              <span>{c.isInvalid ? "--" : c.bpm.toFixed(1)}</span>
              <span>
                {c.isInvalid || c.rr > 25 || c.rr === 0
                  ? "--"
                  : c.rr.toFixed(1)}
              </span>
              <span>{c.latency}</span>
              <span className={c.isInvalid ? "quality-low" : "quality-good"}>
                {c.isInvalid ? "Invalid" : "Stable"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
