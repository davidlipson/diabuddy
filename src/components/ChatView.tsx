import { useState, useRef, useEffect } from "react";
import {
  Box,
  TextField,
  IconButton,
  Typography,
  CircularProgress,
} from "@mui/material";
import {
  AreaChart,
  Area,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import SendIcon from "@mui/icons-material/Send";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import CloseIcon from "@mui/icons-material/Close";
import { ChatMessage, sendChatMessage } from "../lib/api";
import { usePlatform } from "../context";

// Embedded glucose chart component with inline data
interface EmbeddedGlucoseChartProps {
  data: Array<{ time: number; value: number }>;
}

function EmbeddedGlucoseChart({ data }: EmbeddedGlucoseChartProps) {
  if (!data || data.length === 0) {
    return (
      <Box sx={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography sx={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
          No glucose data available
        </Typography>
      </Box>
    );
  }

  const chartData = [...data].sort((a, b) => a.time - b.time);
  const maxValue = Math.max(...chartData.map((d) => d.value), 12);
  const minValue = Math.min(...chartData.map((d) => d.value), 3);

  return (
    <Box sx={{ height: 100, width: "100%", my: 1 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <defs>
            <linearGradient id="chatGlucoseGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1976d2" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#1976d2" stopOpacity={0} />
            </linearGradient>
          </defs>
          <ReferenceArea y1={3.9} y2={10.0} fill="#22c55e" fillOpacity={0.1} />
          <ReferenceLine y={3.9} stroke="#ef4444" strokeDasharray="2 2" strokeOpacity={0.5} />
          <ReferenceLine y={10.0} stroke="#eab308" strokeDasharray="2 2" strokeOpacity={0.5} />
          <YAxis domain={[Math.max(0, minValue - 1), maxValue + 1]} hide />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#1976d2"
            strokeWidth={2}
            fill="url(#chatGlucoseGradient)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  );
}

// Parse GLUCOSE_CHART data: [GLUCOSE_CHART:(timestamp,value),(timestamp,value),...]
function parseGlucoseChartData(dataStr: string): Array<{ time: number; value: number }> | null {
  try {
    const points: Array<{ time: number; value: number }> = [];
    // Match (timestamp,value) pairs
    const pointPattern = /\(([^,]+),([^)]+)\)/g;
    let match;
    while ((match = pointPattern.exec(dataStr)) !== null) {
      const timestamp = match[1].trim();
      const value = parseFloat(match[2].trim());
      if (!isNaN(value)) {
        // Handle ISO timestamp or unix timestamp
        const time = timestamp.includes("T") 
          ? new Date(timestamp).getTime() 
          : parseInt(timestamp, 10);
        if (!isNaN(time)) {
          points.push({ time, value });
        }
      }
    }
    return points.length > 0 ? points : null;
  } catch {
    return null;
  }
}

// Parse markdown bold (**text**) and return React elements
function parseMarkdownBold(text: string, keyOffset: number): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${keyOffset}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

// Parse message content and return React elements with bold text and embedded charts
function parseMessageContent(text: string): React.ReactNode {
  // Match [GLUCOSE_CHART:...data...] - capture everything between GLUCOSE_CHART: and ]
  const chartPattern = /\[GLUCOSE_CHART:([^\]]+)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = chartPattern.exec(text)) !== null) {
    // Add text before the chart
    if (match.index > lastIndex) {
      parts.push(
        <span key={`text-${parts.length}`}>
          {parseMarkdownBold(text.slice(lastIndex, match.index), parts.length)}
        </span>
      );
    }
    // Parse and add the chart
    const chartData = parseGlucoseChartData(match[1]);
    if (chartData) {
      parts.push(<EmbeddedGlucoseChart key={`chart-${parts.length}`} data={chartData} />);
    }
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(
      <span key={`text-${parts.length}`}>
        {parseMarkdownBold(text.slice(lastIndex), parts.length)}
      </span>
    );
  }

  return parts.length > 0 ? parts : parseMarkdownBold(text, 0);
}

interface ChatViewProps {
  onClose?: () => void;
}

export function ChatView({ onClose }: ChatViewProps) {
  const { isMobile } = usePlatform();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await sendChatMessage(newMessages);
      if (response) {
        setMessages([
          ...newMessages,
          { role: "assistant", content: response.message },
        ]);
      } else {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content:
              "Sorry, I couldn't process that request. Please try again.",
          },
        ]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "An error occurred. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        p: isMobile ? 2 : 1.5,
        gap: 1.5,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          pb: 1,
          borderBottom: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <SmartToyIcon sx={{ color: "#1976d2", fontSize: isMobile ? 24 : 20 }} />
        <Typography
          sx={{
            color: "rgba(255,255,255,0.9)",
            fontSize: isMobile ? 18 : 14,
            fontWeight: 600,
            flex: 1,
          }}
        >
          Chat with Diabuddy
        </Typography>
        {onClose && (
          <IconButton
            onClick={onClose}
            size="small"
            sx={{
              color: "rgba(255,255,255,0.5)",
              "&:hover": {
                color: "rgba(255,255,255,0.8)",
                bgcolor: "rgba(255,255,255,0.1)",
              },
            }}
          >
            <CloseIcon />
          </IconButton>
        )}
      </Box>

      {/* Messages */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          pr: 0.5,
          "&::-webkit-scrollbar": {
            width: 6,
          },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: "rgba(255,255,255,0.2)",
            borderRadius: 3,
          },
        }}
      >
        {messages.length === 0 ? (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              color: "rgba(255,255,255,0.4)",
            }}
          >
            <SmartToyIcon sx={{ fontSize: 48, opacity: 0.5 }} />
            <Typography
              sx={{
                fontSize: isMobile ? 14 : 12,
                textAlign: "center",
                maxWidth: 280,
              }}
            >
              Ask me about your glucose levels, meals, insulin, or general
              diabetes questions.
            </Typography>
          </Box>
        ) : (
          messages.map((msg, idx) => (
            <Box
              key={idx}
              sx={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <Box
                sx={{
                  maxWidth: "85%",
                  p: isMobile ? 1.5 : 1.25,
                  borderRadius: 2,
                  backgroundColor:
                    msg.role === "user" ? "#1976d2" : "rgba(255,255,255,0.08)",
                  color:
                    msg.role === "user" ? "white" : "rgba(255,255,255,0.9)",
                }}
              >
                <Typography
                  component="div"
                  sx={{
                    fontSize: isMobile ? 14 : 12,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {parseMessageContent(msg.content)}
                </Typography>
              </Box>
            </Box>
          ))
        )}
        {isLoading && (
          <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
            <Box
              sx={{
                p: isMobile ? 1.5 : 1.25,
                borderRadius: 2,
                backgroundColor: "rgba(255,255,255,0.08)",
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <CircularProgress
                size={16}
                sx={{ color: "rgba(255,255,255,0.5)" }}
              />
              <Typography
                sx={{
                  fontSize: isMobile ? 14 : 12,
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                Thinking...
              </Typography>
            </Box>
          </Box>
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-end",
          gap: 1,
          pt: 1,
          borderTop: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <TextField
          fullWidth
          multiline
          maxRows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          disabled={isLoading}
          sx={{
            "& .MuiOutlinedInput-root": {
              backgroundColor: "rgba(255,255,255,0.05)",
              borderRadius: 2,
              fontSize: isMobile ? 14 : 12,
              color: "white",
              height: isMobile ? 48 : 40,
              "& fieldset": {
                borderColor: "rgba(255,255,255,0.15)",
              },
              "&:hover fieldset": {
                borderColor: "rgba(255,255,255,0.25)",
              },
              "&.Mui-focused fieldset": {
                borderColor: "#1976d2",
              },
            },
            "& .MuiOutlinedInput-input": {
              padding: isMobile ? "12px 14px" : "10px 12px",
              "&::placeholder": {
                color: "rgba(255,255,255,0.4)",
                opacity: 1,
              },
            },
          }}
        />
        <IconButton
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          sx={{
            backgroundColor: "#1976d2",
            color: "white",
            borderRadius: 2,
            width: isMobile ? 48 : 40,
            height: isMobile ? 48 : 40,
            flexShrink: 0,
            "&:hover": {
              backgroundColor: "#1565c0",
            },
            "&.Mui-disabled": {
              backgroundColor: "rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.3)",
            },
          }}
        >
          <SendIcon sx={{ fontSize: isMobile ? 22 : 18 }} />
        </IconButton>
      </Box>
    </Box>
  );
}
