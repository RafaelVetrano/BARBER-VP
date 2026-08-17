import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendAiChatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  content!: string;
}
