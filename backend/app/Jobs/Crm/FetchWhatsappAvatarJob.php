<?php

namespace App\Jobs\Crm;

use App\Models\Clinic;
use App\Models\Crm\Connection;
use App\Models\Crm\Contact;
use App\Services\Crm\EnsureWhatsappAvatar;
use App\Support\ClinicContext;
use Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class FetchWhatsappAvatarJob implements ShouldQueue, ShouldBeUniqueUntilProcessing
{
    use Queueable;

    public int $uniqueFor = 120;

    public function __construct(
        public int $connectionId,
        public int $contactId,
    ) {}

    public function uniqueId(): string
    {
        return 'wa-avatar:'.$this->connectionId.':'.$this->contactId;
    }

    public function handle(EnsureWhatsappAvatar $ensure, ClinicContext $clinicContext): void
    {
        $connection = Connection::withoutGlobalScopes()->find($this->connectionId);
        $contact = Contact::withoutGlobalScopes()->find($this->contactId);
        if (! $connection || ! $contact) {
            return;
        }

        $clinic = Clinic::query()->find($connection->clinic_id);
        if ($clinic) {
            $clinicContext->set($clinic);
        }

        $ensure->handle($connection, $contact);
    }
}
