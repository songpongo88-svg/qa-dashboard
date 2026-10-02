// Vendored GSM 6.10 decoder (WTFPL), adapted to ESM from QianNangong/gsm-decoder-js.
// Used only to convert Microsoft GSM WAV call recordings into browser-playable PCM WAV.
class GSMDecoder {
    constructor() {
        /** private fields */
        if (this.outsig === undefined)
            this.outsig = null;
        if (this.prevLARpp === undefined)
            this.prevLARpp = null;
        if (this.rp === undefined)
            this.rp = null;
        if (this.u === undefined)
            this.u = null;
        if (this.lastSID === undefined)
            this.lastSID = null;
        if (this.prevNc === undefined)
            this.prevNc = 0;
        if (this.prevOut === undefined)
            this.prevOut = 0;
        if (this.quantRes === undefined)
            this.quantRes = null;
        if (this.seed === undefined)
            this.seed = 0;
        if (this.parameters === undefined)
            this.parameters = null;
        if (this.LARpp === undefined)
            this.LARpp = null;

        this.outsig = (function (s) {
            let a = [];
            while (s-- > 0)
                a.push(0);
            return a;
        })(160);
        this.prevLARpp = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        this.rp = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        this.u = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        this.lastSID = (function (s) {
            let a = [];
            while (s-- > 0)
                a.push(0);
            return a;
        })(76);
        this.quantRes = (function (s) {
            let a = [];
            while (s-- > 0)
                a.push(0);
            return a;
        })(280);
        this.parameters = (function (s) {
            let a = [];
            while (s-- > 0)
                a.push(0);
            return a;
        })(76);
        this.LARpp = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    }

    /**
     * @static
     */
    static __static_initialize() {
        if (!GSMDecoder.__static_initialized) {
            GSMDecoder.__static_initialized = true;
            GSMDecoder.__static_initializer_0();
        }
    }

    /**
     * @private
     */
    GSMrand() {
        this.seed = this.seed * 1103515245 + 12345;
        return this.seed & 32767;
    }

    /**
     * @public
     */
    decoderInit() {
        this.prevNc = 40;
        this.prevOut = 0.0;
        for (let i = 0; i < 9; i++) {
            {
                this.prevLARpp[i] = 0.0;
                this.rp[i] = 0.0;
                this.u[i] = 0.0;
            }
        }
        for (let i = 0; i < this.lastSID.length; i++) {
            this.lastSID[i] = 0;
        }
        this.lastSID[0] = 2;
        this.lastSID[1] = 28;
        this.lastSID[2] = 18;
        this.lastSID[3] = 12;
        this.lastSID[4] = 7;
        this.lastSID[5] = 5;
        this.lastSID[6] = 3;
        this.lastSID[7] = 2;
        for (let i = 0; i < this.quantRes.length; i++) {
            this.quantRes[i] = 0.0;
        }
        this.seed = 1;
    }

    /**
     * @public
     * @param {Uint8Array | Buffer} src
     * @param {number} srcoffset
     * @param {Uint8Array | Buffer} dst
     * @param {number} dstoffset
     */
    decodeFrame(src, srcoffset, dst, dstoffset) {
        let arraycopy = function (srcPts, srcOff, dstPts, dstOff, size) {
            if (srcPts !== dstPts || dstOff >= srcOff + size) {
                while (--size >= 0)
                    dstPts[dstOff++] = srcPts[srcOff++];
            } else {
                let tmp = srcPts.slice(srcOff, srcOff + size);
                for (let i = 0; i < size; i++)
                    dstPts[dstOff++] = tmp[i];
            }
        }

        let parameters = this.parameters;
        let lastSID = this.lastSID;
        let LARpp = this.LARpp;
        let u = this.u;
        let rp = this.rp;
        let prevLARpp = this.prevLARpp;
        let quantRes = this.quantRes;
        arraycopy(quantRes, 160, quantRes, 0, 120);
        if (!this.UnpackBitStream(src, srcoffset, parameters))
            return false;
        let frameType = 0;
        for (let i = 0; i < 76; i++) {
            if (0 === parameters[i])
                continue;
            frameType = 2;
            break;
        }
        if (frameType === 0) {
            arraycopy(lastSID, 0, parameters, 0, 76);
            frameType = 2;
        } else {
            for (let subFrameNumber = 0; subFrameNumber < 4; subFrameNumber++) {
                let subFramePulseBase = subFrameNumber * 17 + 8 + 4;
                for (let j = 0; j < 13; j++) {
                    if (parameters[subFramePulseBase + j] === 0)
                        continue;
                    frameType = 1;
                    subFrameNumber = 4;
                    break;
                }
            }
            if (frameType === 2)
                arraycopy(parameters, 0, lastSID, 0, 76);
        }
        if (frameType === 2) {
            for (let subFrameNumber = 0; subFrameNumber < 4; subFrameNumber++) {
                let subFrameParamBase = subFrameNumber * 17 + 8;
                for (let j = 0; j < 13; j++) {
                    parameters[subFrameParamBase + 4 + j] = (this.GSMrand() / 5461 | 0) + 1;
                }
                parameters[subFrameParamBase + 2] = (this.GSMrand() / 10923 | 0);
                parameters[subFrameParamBase + 1] = 0;
                parameters[subFrameParamBase] = (function (lhs, rhs) {
                    return lhs || rhs;
                })((subFrameNumber === 0), (subFrameNumber === 2)) ? 40 : 120;
            }
        }
        for (let subFrameNumber = 0; subFrameNumber < 4; subFrameNumber++) {
            let subFrameParamBase = subFrameNumber * 17 + 8;
            let tempLtpLag = parameters[subFrameParamBase];
            if (tempLtpLag >= 40 && tempLtpLag <= 120)
                this.prevNc = tempLtpLag;
            let ltpGain = GSMDecoder.QLB_$LI$()[parameters[subFrameParamBase + 1]];
            let rpeGridPos = parameters[subFrameParamBase + 2];
            let xmaxp = GSMDecoder.xmaxTable_$LI$()[parameters[subFrameParamBase + 3]];
            let subFrameResidualBase = subFrameNumber * 40 + 120;
            for (let i = 0; i < 40; i++) {
                quantRes[subFrameResidualBase + i] = ltpGain * quantRes[(subFrameResidualBase + i) - this.prevNc];
            }
            for (let i = 0; i < 13; i++) {
                quantRes[subFrameResidualBase + rpeGridPos + 3 * i] += (0.25 * parameters[subFrameParamBase + 4 + i] - 0.875) * xmaxp;
            }
        }
        for (let larNum = 0; larNum < 8; larNum++) {
            LARpp[larNum + 1] = GSMDecoder.larTable_$LI$()[larNum][parameters[larNum]];
        }
        let prevOut = this.prevOut;
        for (let larInterpNumber = 0; larInterpNumber < 4; larInterpNumber++) {
            for (let i = 1; i <= 8; i++) {
                let LARpi = prevLARpp[i] * GSMDecoder.InterpLarCoef_$LI$()[larInterpNumber][0] + LARpp[i] * GSMDecoder.InterpLarCoef_$LI$()[larInterpNumber][1];
                if (Math.abs(LARpi) < 0.675)
                    rp[i] = LARpi;
                else if (Math.abs(LARpi) < 1.225)
                    rp[i] = (LARpi <= 0.0 ? -1.0 : 1.0) * (0.5 * Math.abs(LARpi) + 0.3375);
                else
                    rp[i] = (LARpi <= 0.0 ? -1.0 : 1.0) * (0.125 * Math.abs(LARpi) + 0.796875);
            }
            for (let outCount = GSMDecoder.larInterpStart_$LI$()[larInterpNumber]; outCount < GSMDecoder.larInterpStart_$LI$()[larInterpNumber + 1]; outCount++) {
                let temp = quantRes[120 + outCount];
                temp -= rp[8] * u[7];
                u[8] = u[7] + rp[8] * temp;
                temp -= rp[7] * u[6];
                u[7] = u[6] + rp[7] * temp;
                temp -= rp[6] * u[5];
                u[6] = u[5] + rp[6] * temp;
                temp -= rp[5] * u[4];
                u[5] = u[4] + rp[5] * temp;
                temp -= rp[4] * u[3];
                u[4] = u[3] + rp[4] * temp;
                temp -= rp[3] * u[2];
                u[3] = u[2] + rp[3] * temp;
                temp -= rp[2] * u[1];
                u[2] = u[1] + rp[2] * temp;
                temp -= rp[1] * u[0];
                u[1] = u[0] + rp[1] * temp;
                prevOut = temp + prevOut * 0.8599854;
                u[0] = temp;
                temp = 65532.0 * prevOut;
                if (temp > 32766.0)
                    temp = 32766.0;
                if (temp < -32766.0)
                    temp = -32766.0;
                this.outsig[outCount] = ((temp | 0) | 0);
            }
        }
        for (let i = 1; i <= 8; i++) {
            prevLARpp[i] = LARpp[i];
        }
        this.prevOut = prevOut;
        let dstIndex = 0;
        for (let i = 0; i < 160; i++) {
            let TempInt = this.outsig[i];
            dst[dstoffset + dstIndex++] = ((TempInt & 255) | 0);
            dst[dstoffset + dstIndex++] = ((TempInt >> 8) | 0);
        }
        return true;
    }

    /**
     * @protected
     */
    UnpackBitStream(inByteStream, inputIndex, Parameters) {
        let paramIndex = 0;
        if ((inByteStream[inputIndex] >> 4 & 15) !== 13)
            return false;
        Parameters[paramIndex++] = (inByteStream[inputIndex] & 15) << 2 | inByteStream[++inputIndex] >> 6 & 3;
        Parameters[paramIndex++] = inByteStream[inputIndex] & 63;
        Parameters[paramIndex++] = inByteStream[++inputIndex] >> 3 & 31;
        Parameters[paramIndex++] = (inByteStream[inputIndex] & 7) << 2 | inByteStream[++inputIndex] >> 6 & 3;
        Parameters[paramIndex++] = inByteStream[inputIndex] >> 2 & 15;
        Parameters[paramIndex++] = (inByteStream[inputIndex] & 3) << 2 | inByteStream[++inputIndex] >> 6 & 3;
        Parameters[paramIndex++] = inByteStream[inputIndex] >> 3 & 7;
        Parameters[paramIndex++] = inByteStream[inputIndex] & 7;
        inputIndex++;
        for (let n = 0; n < 4; n++) {
            Parameters[paramIndex++] = inByteStream[inputIndex] >> 1 & 127;
            Parameters[paramIndex++] = (inByteStream[inputIndex] & 1) << 1 | inByteStream[++inputIndex] >> 7 & 1;
            Parameters[paramIndex++] = inByteStream[inputIndex] >> 5 & 3;
            Parameters[paramIndex++] = (inByteStream[inputIndex] & 31) << 1 | inByteStream[++inputIndex] >> 7 & 1;
            Parameters[paramIndex++] = inByteStream[inputIndex] >> 4 & 7;
            Parameters[paramIndex++] = inByteStream[inputIndex] >> 1 & 7;
            Parameters[paramIndex++] = (inByteStream[inputIndex] & 1) << 2 | inByteStream[++inputIndex] >> 6 & 3;
            Parameters[paramIndex++] = inByteStream[inputIndex] >> 3 & 7;
            Parameters[paramIndex++] = inByteStream[inputIndex] & 7;
            Parameters[paramIndex++] = inByteStream[++inputIndex] >> 5 & 7;
            Parameters[paramIndex++] = inByteStream[inputIndex] >> 2 & 7;
            Parameters[paramIndex++] = (inByteStream[inputIndex] & 3) << 1 | inByteStream[++inputIndex] >> 7 & 1;
            Parameters[paramIndex++] = inByteStream[inputIndex] >> 4 & 7;
            Parameters[paramIndex++] = inByteStream[inputIndex] >> 1 & 7;
            Parameters[paramIndex++] = (inByteStream[inputIndex] & 1) << 2 | inByteStream[++inputIndex] >> 6 & 3;
            Parameters[paramIndex++] = inByteStream[inputIndex] >> 3 & 7;
            Parameters[paramIndex++] = inByteStream[inputIndex] & 7;
            inputIndex++;
        }
        return true;
    }

    /**
     * @static
     */
    static QLB_$LI$() {
        GSMDecoder.__static_initialize();
        if (GSMDecoder.QLB == null)
            GSMDecoder.QLB = [0.1, 0.35, 0.65, 1.0];
        return GSMDecoder.QLB;
    }

    /**
     * @static
     */
    static larInterpStart_$LI$() {
        GSMDecoder.__static_initialize();
        if (GSMDecoder.larInterpStart == null)
            GSMDecoder.larInterpStart = [0, 13, 27, 40, 160];
        return GSMDecoder.larInterpStart;
    }

    /**
     * @static
     */
    static InterpLarCoef_$LI$() {
        GSMDecoder.__static_initialize();
        if (GSMDecoder.InterpLarCoef == null)
            GSMDecoder.InterpLarCoef = [[0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.0, 1.0]];
        return GSMDecoder.InterpLarCoef;
    }

    /**
     * @static
     */
    static xmaxTable_$LI$() {
        GSMDecoder.__static_initialize();
        return GSMDecoder.xmaxTable;
    }

    /**
     * @static
     */
    static larTable_$LI$() {
        GSMDecoder.__static_initialize();
        return GSMDecoder.larTable;
    }

    /**
     * @static
     */
    static __static_initializer_0() {
        let B = [0, 0, 2048, -2560, 94, -1792, -341, -1144];
        let MIC = [-32, -32, -16, -16, -8, -8, -4, -4];
        let INVA = [13107, 13107, 13107, 13107, 19223, 17476, 31454, 29708];
        GSMDecoder.xmaxTable = (function (s) {
            let a = [];
            while (s-- > 0)
                a.push(0);
            return a;
        })(64);
        for (let xmaxc = 0; xmaxc < 64; xmaxc++) {
            let xmaxp = void 0;
            if (xmaxc < 16) {
                xmaxp = 31 + (xmaxc << 5);
            } else {
                let exp = xmaxc - 16 >> 3;
                xmaxp = ((576 << exp) - 1) + (xmaxc - 16 - 8 * exp) * (64 << exp);
            }
            GSMDecoder.xmaxTable_$LI$()[xmaxc] = xmaxp / 32768.0;
        }
        GSMDecoder.larTable = [null, null, null, null, null, null, null, null];
        for (let larNum = 0; larNum < 8; larNum++) {
            GSMDecoder.larTable_$LI$()[larNum] = (function (s) {
                let a = [];
                while (s-- > 0)
                    a.push(0);
                return a;
            })(-MIC[larNum] * 2);
            for (let larQuant = 0; larQuant < -MIC[larNum] * 2; larQuant++) {
                let temp = (((larQuant + MIC[larNum] << 10) - B[larNum] * 2) | 0);
                temp = ((((function (n) {
                    return n < 0 ? Math.ceil(n) : Math.floor(n);
                })((temp * INVA[larNum])) + 16384 >> 15) | 0) | 0);
                GSMDecoder.larTable_$LI$()[larNum][larQuant] = (temp * 2) / 16384.0;
            }
        }
    }
}

GSMDecoder.__static_initialized = false;
GSMDecoder.larTable_$LI$();
GSMDecoder.xmaxTable_$LI$();
GSMDecoder.InterpLarCoef_$LI$();
GSMDecoder.larInterpStart_$LI$();
GSMDecoder.QLB_$LI$();
GSMDecoder.__static_initialize();

export default GSMDecoder
