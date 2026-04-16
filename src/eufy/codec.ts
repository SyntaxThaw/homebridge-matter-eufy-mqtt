import * as protobuf from 'protobufjs';
import * as path from 'path';

export class EufyCodec {
  private root: protobuf.Root;

  constructor() {
    this.root = new protobuf.Root();
  }

  public async loadSchemas(): Promise<void> {
    // Load all the standard cloud generic schemas for run status etc.
    const protoDir = path.join(__dirname, 'proto', 'cloud');
    
    // We explicitly load the main schemas needed for mapping
    await this.root.load([
      path.join(protoDir, 'work_status.proto'),
      path.join(protoDir, 'clean_param.proto'),
      path.join(protoDir, 'error_code.proto')
    ]);
  }

  /**
   * Decodes a base64 encoded protobuff string, stripping the varint length prefix if needed
   */
  public decode(typeName: string, base64Payload: string, hasLengthPrefix = true): any {
    const Type = this.root.lookupType(typeName);
    const buffer = Buffer.from(base64Payload, 'base64');
    
    let payload = buffer;
    if (hasLengthPrefix) {
      // Decode varint to find length of actual message, strip it.
      const reader = protobuf.Reader.create(buffer);
      const len = reader.uint32();
      payload = buffer.subarray(reader.pos, reader.pos + len);
    }
    
    return Type.decode(payload);
  }

  /**
   * Encodes a payload dictionary into a base64 protobuf string
   */
  public encode(typeName: string, payload: any, hasLengthPrefix = true): string {
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
