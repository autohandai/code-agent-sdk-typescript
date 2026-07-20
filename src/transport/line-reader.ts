/**
 * Buffered line reader for stdin/stdout streams
 * 
 * Handles partial messages and newline-delimited JSON by buffering
 * incoming data and yielding complete lines. This is essential for
 * reading JSON-RPC messages from the CLI subprocess.
 * 
 * @example
 * ```typescript
 * const reader = new LineReader(process.stdout);
 * 
 * for await (const line of reader) {
 *   const message = JSON.parse(line);
 *   console.log('Received:', message);
 * }
 * ```
 * 
 * @internal
 */

export class LineReader {
  private buffer = '';
  private lineQueue: string[] = [];
  private resolvers: Array<{
    resolve: (line: string) => void;
    reject: (error: Error) => void;
  }> = [];
  private closed = false;

  /**
   * Create a new LineReader
   * 
   * @param stream - The readable stream to read from (e.g., process.stdout)
   */
  constructor(private stream: NodeJS.ReadableStream) {
    this.stream.setEncoding('utf8');
    this.stream.on('data', (chunk: string) => this.handleData(chunk));
    this.stream.on('end', () => this.handleEnd());
    this.stream.on('close', () => this.handleClose());
  }

  /**
   * Handle incoming data chunks
   * 
   * Buffers incoming data and extracts complete lines when newlines are encountered.
   * 
   * @param chunk - Data chunk from the stream
   * @private
   */
  private handleData(chunk: string): void {
    this.buffer += chunk;

    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (line.trim()) {
        this.deliverLine(line);
      }
    }
  }

  /**
   * Handle stream end event
   * 
   * Delivers any remaining buffered data when the stream ends.
   * 
   * @private
   */
  private handleEnd(): void {
    if (this.buffer.trim()) {
      this.deliverLine(this.buffer);
    }
    this.buffer = '';
    this.close();
  }

  /**
   * Handle stream close event
   * 
   * Marks the reader as closed when the stream closes.
   * 
   * @private
   */
  private handleClose(): void {
    this.close();
  }

  /**
   * Deliver a line to a waiting resolver or queue it
   * 
   * @param line - The line to deliver
   * @private
   */
  private deliverLine(line: string): void {
    if (this.resolvers.length > 0) {
      const waiter = this.resolvers.shift();
      if (waiter === undefined) {
        this.lineQueue.push(line);
        return;
      }
      waiter.resolve(line);
    } else {
      this.lineQueue.push(line);
    }
  }

  /**
   * Read a line from the stream
   * 
   * Returns the next available line from the queue, or waits for the next line
   * if the queue is empty. Throws an error if the stream is closed.
   * 
   * @returns The next complete line from the stream
   * @throws {Error} If the stream is closed and no lines are available
   */
  async readLine(): Promise<string> {
    if (this.lineQueue.length > 0) {
      const line = this.lineQueue.shift();
      if (line === undefined) {
        throw new Error('Line queue unexpectedly empty');
      }
      return line;
    }

    if (this.closed) {
      throw new Error('Stream closed');
    }

    return new Promise((resolve, reject) => {
      this.resolvers.push({ resolve, reject });
    });
  }

  /** Close the reader and reject callers currently waiting for another line. */
  close(error: Error = new Error('Stream closed')): void {
    if (this.closed) return;
    this.closed = true;
    const waiters = this.resolvers.splice(0);
    for (const waiter of waiters) {
      waiter.reject(error);
    }
  }

  /**
   * Check if there are pending lines in the queue
   * 
   * @returns true if there are lines waiting to be read
   */
  hasPendingLines(): boolean {
    return this.lineQueue.length > 0;
  }

  /**
   * Check if the stream is closed
   * 
   * @returns true if the stream has ended or closed
   */
  isClosed(): boolean {
    return this.closed;
  }
}
