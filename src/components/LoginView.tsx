import { useState } from "react";
import { Box, Stack, TextField, Button, Typography, CircularProgress } from "@mui/material";

interface LoginViewProps {
  onLogin: (email: string, password: string) => Promise<boolean>;
  isLoading: boolean;
}

export function LoginView({ onLogin, isLoading }: LoginViewProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }

    const success = await onLogin(email, password);
    if (!success) {
      setError("Login failed. Check your credentials.");
    }
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 3,
      }}
    >
      <Stack spacing={1.5} width="100%">
        <Typography variant="subtitle2" textAlign="center" fontWeight={600}>
          LibreLinkUp Login
        </Typography>
        
        <TextField
          size="small"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          fullWidth
          sx={{
            "& .MuiInputBase-root": { fontSize: "0.8rem" },
            "& .MuiInputLabel-root": { fontSize: "0.8rem" },
          }}
        />
        
        <TextField
          size="small"
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          fullWidth
          sx={{
            "& .MuiInputBase-root": { fontSize: "0.8rem" },
            "& .MuiInputLabel-root": { fontSize: "0.8rem" },
          }}
        />
        
        {error && (
          <Typography variant="caption" color="error" textAlign="center">
            {error}
          </Typography>
        )}
        
        <Button
          type="submit"
          variant="contained"
          disabled={isLoading}
          size="small"
          sx={{ mt: 1 }}
        >
          {isLoading ? <CircularProgress size={18} /> : "Login"}
        </Button>
      </Stack>
    </Box>
  );
}

