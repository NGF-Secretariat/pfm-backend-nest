import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'PFM Backend is running smoothly 🚀 | Status: Operational | Developed by Opemipo Alomaja';
  }
}
