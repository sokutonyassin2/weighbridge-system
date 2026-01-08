import { io, Socket } from 'socket.io-client';

class HardwareWebSocket {
  private socket: Socket | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectInterval: number = 5000;
  private url: string;

  constructor(url: string = `http://${window.location.hostname}:5000`) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        resolve();
        return;
      }

      try {
        this.socket = io(this.url, {
          transports: ['websocket', 'polling'],
          timeout: 10000,
        });

        this.socket.on('connect', () => {
          console.log('Connected to hardware server');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          console.error('Connection error to hardware server:', error);
          this.isConnected = false;
          reject(error);
        });

        this.socket.on('disconnect', (reason) => {
          console.log('Disconnected from hardware server:', reason);
          this.isConnected = false;
          
          // Attempt to reconnect if not manually disconnected
          if (reason !== 'io client disconnect') {
            this.attemptReconnect();
          }
        });

        this.socket.on('weightUpdate', (data) => {
          console.log('Received weight update:', data);
          // Emit custom event for the application to handle
          window.dispatchEvent(new CustomEvent('weightUpdate', { detail: data }));
        });
      } catch (error) {
        console.error('Error initializing WebSocket:', error);
        reject(error);
      }
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect().catch(() => {
          this.attemptReconnect();
        });
      }, this.reconnectInterval);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.isConnected = false;
      console.log('Disconnected from hardware server');
    }
  }

  isConnectedToHardware(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  // Method to send a test command to the hardware
  sendTestCommand(): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('testCommand', { timestamp: Date.now() });
    }
  }

  // Method to request current weight from hardware
  requestCurrentWeight(entryId: string, vehicleNo: string): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('requestWeight', { entryId, vehicleNo });
    }
  }
}

export default HardwareWebSocket;