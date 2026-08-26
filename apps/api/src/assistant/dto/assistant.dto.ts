import { IsString, MaxLength, MinLength } from 'class-validator';
import { AI_MESSAGE_MAX_LENGTH } from '@barbervp/types';

export class SendAiChatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(AI_MESSAGE_MAX_LENGTH)
  content!: string;
}
