<?php

namespace App\Jobs\Crm;

use App\Models\Crm\WhatsappCampaign;
use App\Models\Crm\WhatsappCampaignRecipient;
use App\Models\Crm\WhatsappMessage;
use App\Models\User;
use App\Services\Crm\RenderCampaignMessage;
use App\Services\Crm\WhatsappApiClient;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

class RunWhatsappCampaignJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 21600;

    public int $tries = 1;

    public function __construct(public int $campaignId) {}

    public function handle(RenderCampaignMessage $renderer): void
    {
        $campaign = WhatsappCampaign::query()->with(['messages', 'user'])->find($this->campaignId);
        if (! $campaign) {
            return;
        }

        /** @var User $user */
        $user = $campaign->user;
        if (! $user || ! filled($user->whatsapp_session_id) || $user->whatsapp_status !== 'connected') {
            $campaign->update([
                'status' => 'failed',
                'completed_at' => now(),
            ]);

            return;
        }

        if (! in_array($campaign->status, ['queued', 'running'], true)) {
            return;
        }

        $campaign->update(['status' => 'running']);

        $messages = $campaign->messages->values();
        if ($messages->isEmpty()) {
            $campaign->update([
                'status' => 'failed',
                'completed_at' => now(),
            ]);

            return;
        }

        $contactDelay = (int) ($campaign->delay_between_contacts_sec ?: 45);
        $jitter = (int) ($campaign->delay_jitter_sec ?: 0);
        $sentCount = (int) $campaign->sent_count;
        $failedCount = (int) $campaign->failed_count;
        $client = new WhatsappApiClient($user);
        $sessionId = (string) $user->whatsapp_session_id;

        $recipients = WhatsappCampaignRecipient::query()
            ->where('whatsapp_campaign_id', $campaign->id)
            ->orderBy('id')
            ->get();

        foreach ($recipients as $index => $recipient) {
            $campaign->refresh();
            if ($campaign->status === 'paused') {
                $campaign->update([
                    'sent_count' => $sentCount,
                    'failed_count' => $failedCount,
                ]);

                return;
            }
            if ($campaign->status === 'cancelled') {
                $campaign->update([
                    'sent_count' => $sentCount,
                    'failed_count' => $failedCount,
                ]);

                return;
            }

            $recipient->refresh();
            if ($recipient->status !== 'pending') {
                continue;
            }

            $recipient->update(['status' => 'sending', 'error_message' => null]);

            try {
                $sequence = $recipient->use_custom_message
                    ? $renderer->parseCustomSequence($recipient->custom_message)
                    : $messages->map(fn ($m) => [
                        'message_body' => (string) $m->message_body,
                        'delay_after_sec' => (int) $m->delay_after_sec,
                    ])->all();

                if ($sequence === []) {
                    throw new \RuntimeException(
                        $recipient->use_custom_message
                            ? 'Sequência personalizada vazia'
                            : 'Empty message body after template render',
                    );
                }

                foreach ($sequence as $msgIdx => $msg) {
                    $campaign->refresh();
                    if (in_array($campaign->status, ['paused', 'cancelled'], true)) {
                        $recipient->update(['status' => 'pending', 'error_message' => null]);
                        $campaign->update([
                            'sent_count' => $sentCount,
                            'failed_count' => $failedCount,
                        ]);

                        return;
                    }

                    $body = $renderer->handle(
                        (string) $msg['message_body'],
                        $recipient->full_name,
                        $recipient->phone,
                    );
                    if (trim($body) === '') {
                        throw new \RuntimeException('Empty message body after template render');
                    }

                    $this->sendMessage($client, $user, $sessionId, $campaign, $recipient, $body);

                    if ($msgIdx < count($sequence) - 1) {
                        $delayAfter = (int) ($msg['delay_after_sec'] ?? 0);
                        if ($delayAfter > 0 && ! $this->sleepInterruptible($campaign, $delayAfter)) {
                            $recipient->update(['status' => 'pending', 'error_message' => null]);
                            $campaign->update([
                                'sent_count' => $sentCount,
                                'failed_count' => $failedCount,
                            ]);

                            return;
                        }
                    }
                }

                $recipient->update([
                    'status' => 'sent',
                    'last_sent_at' => now(),
                    'error_message' => null,
                ]);
                $sentCount++;
            } catch (Throwable $e) {
                $failedCount++;
                $recipient->update([
                    'status' => 'failed',
                    'error_message' => mb_substr($e->getMessage(), 0, 500),
                ]);
                Log::warning('WhatsApp campaign send failed', [
                    'campaign_id' => $campaign->id,
                    'recipient_id' => $recipient->id,
                    'error' => $e->getMessage(),
                ]);
            }

            $campaign->update([
                'sent_count' => $sentCount,
                'failed_count' => $failedCount,
            ]);

            $hasMorePending = $recipients->slice($index + 1)->contains(
                fn (WhatsappCampaignRecipient $r) => $r->fresh()?->status === 'pending',
            );
            if ($hasMorePending) {
                $wait = $contactDelay + ($jitter > 0 ? random_int(0, $jitter) : 0);
                if ($wait > 0 && ! $this->sleepInterruptible($campaign, $wait)) {
                    return;
                }
            }
        }

        $campaign->refresh();
        if (in_array($campaign->status, ['paused', 'cancelled'], true)) {
            return;
        }

        $campaign->update([
            'status' => 'completed',
            'sent_count' => $sentCount,
            'failed_count' => $failedCount,
            'completed_at' => now(),
        ]);
    }

    private function sendMessage(
        WhatsappApiClient $client,
        User $user,
        string $sessionId,
        WhatsappCampaign $campaign,
        WhatsappCampaignRecipient $recipient,
        string $body,
    ): void {
        $jid = $recipient->phone.'@c.us';
        $result = $client->send($sessionId, $jid, $body);
        $messageId = $result['messageId'] ?? $result['message_id'] ?? null;

        WhatsappMessage::create([
            'user_id' => $user->id,
            'session_id' => $sessionId,
            'whatsapp_jid' => $jid,
            'phone_number' => $recipient->phone,
            'contact_name' => $recipient->full_name,
            'direction' => 'outbound',
            'body' => $body,
            'message_id' => $messageId,
            'type' => 'chat',
            'has_media' => false,
            'whatsapp_campaign_id' => $campaign->id,
            'whatsapp_campaign_recipient_id' => $recipient->id,
            'raw' => $result,
            'wa_timestamp' => now(),
        ]);
    }

    /**
     * Sleep in chunks and abort early on pause/cancel.
     */
    private function sleepInterruptible(WhatsappCampaign $campaign, int $seconds): bool
    {
        $remaining = max(0, $seconds);
        while ($remaining > 0) {
            $chunk = min(5, $remaining);
            sleep($chunk);
            $remaining -= $chunk;
            $campaign->refresh();
            if (in_array($campaign->status, ['paused', 'cancelled'], true)) {
                return false;
            }
        }

        return true;
    }
}
