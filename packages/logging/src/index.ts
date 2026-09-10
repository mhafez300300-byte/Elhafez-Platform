import { Global, Injectable, LoggerService, Module } from '@nestjs/common';

@Injectable()
export class StructuredLogger implements LoggerService {
  private write(level: string, message: unknown, context?: string): void {
    const payload = { timestamp: new Date().toISOString(), level, context: context ?? null, message };
    const line = JSON.stringify(payload);
    if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
  }
  log(message: unknown, context?: string): void { this.write('info', message, context); }
  error(message: unknown, trace?: string, context?: string): void { this.write('error', { message, trace: trace ?? null }, context); }
  warn(message: unknown, context?: string): void { this.write('warn', message, context); }
  debug(message: unknown, context?: string): void { this.write('debug', message, context); }
  verbose(message: unknown, context?: string): void { this.write('verbose', message, context); }
}

@Global()
@Module({ providers: [StructuredLogger], exports: [StructuredLogger] })
export class LoggingModule {}
