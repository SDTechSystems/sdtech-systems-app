import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installKeyboardScroll } from "./lib/keyboard-scroll";

installKeyboardScroll();

createRoot(document.getElementById("root")!).render(<App />);
