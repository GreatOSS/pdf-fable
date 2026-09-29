import "pdfjs-dist/web/pdf_viewer.css";
import "./styles.css";
import { applyIcons } from "./icons";
import { LeaflineApp } from "./app";

applyIcons(document);
const app = new LeaflineApp();
// Exposed for debugging and automated hands-on testing.
(window as unknown as { leafline: LeaflineApp }).leafline = app;
