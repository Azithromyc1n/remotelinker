import { Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import ChatRoom from "./pages/ChatRoom";

const App = () => {
    return (
        <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/chat/:roomID" element={<ChatRoom />} />
        </Routes>
    )
}

export default App;