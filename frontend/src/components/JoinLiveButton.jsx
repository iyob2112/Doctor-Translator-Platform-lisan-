import { useNavigate } from "react-router-dom";

export default function JoinLiveButton({ sessionId, status }) {
  const navigate = useNavigate();
  if (status !== "active") return null;
  return (
    <button
      type="button"
      className="btn-dark px-3 py-1.5 text-xs"
      onClick={() => navigate(`/call/${sessionId}`)}
    >
      Join live
    </button>
  );
}
