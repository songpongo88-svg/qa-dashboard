import GSMDecoder from "./vendor/gsmDecoder.js";

const FIELD_WIDTHS = (() => {
  const widths = [6, 6, 5, 5, 4, 4, 3, 3];
  for (let subframe = 0; subframe < 4; subframe += 1) {
    widths.push(7, 2, 2, 6);
    for (let pulse = 0; pulse < 13; pulse += 1) widths.push(3);
  }
  return widths;
})();

function readAscii(view: DataView, offset: number, length: number) {
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += String.fromCharCode(view.getUint8(offset + index));
  }
  return out;
}

function parseWav(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 44 || readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
    return null;
  }

  let offset = 12;
  let audioFormat = 0;
  let sampleRate = 0;
  let blockAlign = 0;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= view.byteLength) {
    const chunkId = readAscii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const payloadOffset = offset + 8;
    const availableSize = Math.max(0, view.byteLength - payloadOffset);

    if (chunkId === "fmt " && chunkSize >= 16 && availableSize >= 16) {
      audioFormat = view.getUint16(payloadOffset, true);
      sampleRate = view.getUint32(payloadOffset + 4, true);
      blockAlign = view.getUint16(payloadOffset + 12, true);
    } else if (chunkId === "data") {
      // Some phone-recording WAV files declare a data chunk slightly larger
      // than the bytes that were actually written. Keep the available bytes
      // instead of rejecting the whole recording so GSM playback can still be repaired.
      dataOffset = payloadOffset;
      dataSize = Math.min(chunkSize || availableSize, availableSize);
      break;
    }

    if (chunkSize > availableSize) break;
    offset = payloadOffset + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0) return null;
  return { audioFormat, sampleRate, blockAlign, dataOffset, dataSize };
}

function readLsbField(bytes: Uint8Array, state: { bitPos: number }, width: number) {
  let value = 0;
  for (let index = 0; index < width; index += 1) {
    const bitPos = state.bitPos;
    const bit = (bytes[Math.floor(bitPos / 8)] >> (bitPos % 8)) & 1;
    value |= bit << index;
    state.bitPos += 1;
  }
  return value;
}

function writeMsbField(bytes: Uint8Array, state: { bitPos: number }, value: number, width: number) {
  for (let index = 0; index < width; index += 1) {
    const bit = (value >> (width - 1 - index)) & 1;
    const bitPos = state.bitPos;
    const byteIndex = Math.floor(bitPos / 8);
    const shift = 7 - (bitPos % 8);
    bytes[byteIndex] |= bit << shift;
    state.bitPos += 1;
  }
}

function unpackMsGsmBlock(block: Uint8Array) {
  const readerState = { bitPos: 0 };
  const frames: Uint8Array[] = [];

  for (let frameIndex = 0; frameIndex < 2; frameIndex += 1) {
    const fields = FIELD_WIDTHS.map((width) => ({
      width,
      value: readLsbField(block, readerState, width),
    }));

    const frame = new Uint8Array(33);
    const writerState = { bitPos: 0 };
    writeMsbField(frame, writerState, 0x0d, 4);
    fields.forEach(({ width, value }) => writeMsbField(frame, writerState, value, width));
    frames.push(frame);
  }

  return frames;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function buildPcmWav(pcmBytes: Uint8Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + pcmBytes.length);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + pcmBytes.length, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, pcmBytes.length, true);

  new Uint8Array(buffer, 44).set(pcmBytes);
  return new Blob([buffer], { type: "audio/wav" });
}

export async function prepareVoiceRecordingForBrowser(file: File) {
  if (!/\.wav$/i.test(file.name) && file.type !== "audio/wav" && file.type !== "audio/x-wav") {
    return { file, converted: false };
  }

  const sourceBuffer = await file.arrayBuffer();
  const parsed = parseWav(sourceBuffer);
  if (!parsed || parsed.audioFormat !== 49) {
    return { file, converted: false };
  }

  const source = new Uint8Array(sourceBuffer, parsed.dataOffset, parsed.dataSize);
  const blockAlign = parsed.blockAlign === 65 ? 65 : 65;
  const completeBlocks = Math.floor(source.length / blockAlign);
  if (!completeBlocks) return { file, converted: false };

  const decoder = new GSMDecoder();
  decoder.decoderInit();

  const pcmBytes = new Uint8Array(completeBlocks * 2 * 320);
  let pcmOffset = 0;

  for (let blockIndex = 0; blockIndex < completeBlocks; blockIndex += 1) {
    const blockStart = blockIndex * blockAlign;
    const block = source.subarray(blockStart, blockStart + 65);
    const frames = unpackMsGsmBlock(block);

    for (const frame of frames) {
      const framePcm = new Uint8Array(320);
      const decoded = decoder.decodeFrame(frame, 0, framePcm, 0);
      if (!decoded) {
        framePcm.fill(0);
      }
      pcmBytes.set(framePcm, pcmOffset);
      pcmOffset += framePcm.length;
    }
  }

  const pcmBlob = buildPcmWav(pcmBytes.subarray(0, pcmOffset), parsed.sampleRate || 8000);
  const baseName = file.name.replace(/\.wav$/i, "");
  const playbackFile = new File([pcmBlob], `${baseName}.playback.wav`, {
    type: "audio/wav",
    lastModified: file.lastModified,
  });

  return {
    file: playbackFile,
    converted: true,
    durationSeconds: pcmOffset / 2 / (parsed.sampleRate || 8000),
  };
}
