"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EufyCodec = void 0;
const protobuf = __importStar(require("protobufjs"));
const path = __importStar(require("path"));
class EufyCodec {
    root;
    constructor() {
        this.root = new protobuf.Root();
    }
    async loadSchemas() {
        const baseDir = __dirname;
        // Override resolvePath to handle "proto/cloud/..." imports from within the files
        this.root.resolvePath = (origin, target) => {
            if (target.startsWith('proto/cloud/')) {
                return path.join(baseDir, target);
            }
            return protobuf.util.path.resolve(origin, target);
        };
        // Load all the standard cloud generic schemas for run status etc.
        const protoDir = path.join(baseDir, 'proto', 'cloud');
        // We explicitly load the main schemas needed for mapping
        await this.root.load([
            path.join(protoDir, 'work_status.proto'),
            path.join(protoDir, 'clean_param.proto'),
            path.join(protoDir, 'error_code.proto'),
            path.join(protoDir, 'control.proto'),
            path.join(protoDir, 'station.proto')
        ]);
    }
    /**
     * Decodes a base64 encoded protobuff string, stripping the varint length prefix if needed
     */
    decode(typeName, base64Payload, hasLengthPrefix = true) {
        const Type = this.root.lookupType(typeName);
        const buffer = Buffer.from(base64Payload, 'base64');
        let payload = buffer;
        if (hasLengthPrefix) {
            // Decode varint to find length of actual message, strip it.
            const reader = protobuf.Reader.create(buffer);
            const len = reader.uint32();
            payload = buffer.subarray(reader.pos, reader.pos + len);
        }
        const message = Type.decode(payload);
        return Type.toObject(message);
    }
    /**
     * Encodes a payload dictionary into a base64 protobuf string
     */
    encode(typeName, payload, hasLengthPrefix = true) {
        const Type = this.root.lookupType(typeName);
        const message = Type.create(payload);
        const buffer = Type.encode(message).finish();
        if (hasLengthPrefix) {
            const writer = protobuf.Writer.create();
            writer.uint32(buffer.length);
            const prefix = writer.finish();
            const finalBuffer = Buffer.concat([prefix, buffer]);
            return finalBuffer.toString('base64');
        }
        return Buffer.from(buffer).toString('base64');
    }
}
exports.EufyCodec = EufyCodec;
