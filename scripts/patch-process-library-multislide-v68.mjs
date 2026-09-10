import fs from "node:fs";

const processPath = "src/processLibrary.tsx";
const nativeMarker = "process-library-native-v69";
const source = fs.readFileSync(processPath, "utf8");

if (!source.includes(nativeMarker)) {
  throw new Error("Process Library source-native implementation is missing.");
}

console.log("Process Library uses the source-native multi-slide implementation; no runtime patch is required.");
