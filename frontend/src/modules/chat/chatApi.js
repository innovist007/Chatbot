import { getAuthToken } from "@/lib/AuthContext";

const API_BASE = import.meta.env.VITE_API_URL || "";

/**
 * Get agent info (display name, etc.)
 */
export async function getAgentInfo() {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE}/chat/agent`, {
    headers: {
      "Authorization": `Bearer ${token}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to load agent: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Stream chat response from agent.
 * Calls onEvent for each event as it arrives.
 * 
 * Events:
 * - { type: "thought", parts: [...] }
 * - { type: "answer", parts: [...] }
 * - { type: "follow_ups", parts: [...] }
 * - { type: "sql", sql: "..." }
 * - { type: "data", rows: [...] }
 * - { type: "chart", spec: {...} }
 * - { type: "error", message: "..." }
 */
export async function streamChat(question, onEvent) {
  const token = getAuthToken();
  
  const response = await fetch(`${API_BASE}/chat/ask/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ question }),
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      // Token expired
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      window.location.href = "/login";
      throw new Error("Session expired");
    }
    throw new Error(`Chat failed: ${response.statusText}`);
  }
  
  // Read streaming response
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // Keep incomplete line for next iteration
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      try {
        const event = JSON.parse(trimmed);
        onEvent(event);
      } catch (err) {
        console.warn("Failed to parse chat event:", trimmed, err);
      }
    }
  }
}