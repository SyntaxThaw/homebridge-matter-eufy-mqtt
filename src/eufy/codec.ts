import * as protobuf from 'protobufjs';
import * as path from 'path';

export class EufyCodec {
  private root: protobuf.Root;

  constructor() {
    this.root = new protobuf.Root();
  }

  public async loadSchemas(): Promise<void> {
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
      path.join(protoDir, 'station.proto'),
      path.join(protoDir, 'timing.proto'),
      path.join(protoDir, 'scene.proto'),
      path.join(protoDir, 'stream.proto'),
      path.join(protoDir, 'universal_data.proto'),
      path.join(protoDir, 'p2pdata.proto'),
      path.join(protoDir, 'multi_maps.proto'),
      path.join(protoDir, 'map_manage.proto'),
    ]);
  }

  /**
   * Decodes a base64 encoded protobuff string, stripping the varint length prefix if needed
   */
  public decode<T extends object = Record<string, unknown>>(
    typeName: string,
    base64Payload: string,
    hasLengthPrefix = true,
  ): T {
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
    return Type.toObject(message) as T;
  }

  /**
   * Encodes a payload dictionary into a base64 protobuf string
   */
  public encode<T extends object>(typeName: string, payload: T, hasLengthPrefix = true): string {
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
