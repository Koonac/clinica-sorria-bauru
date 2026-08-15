<?php

namespace App\Services\Crm;

use App\Models\Crm\Contact;
use App\Models\Crm\Lead;

class EnsureContactForLead
{
    /**
     * Garante que o lead tenha um Contact (cria ou reusa por whatsapp_jid) e seta contact_id.
     */
    public function handle(Lead $lead): Contact
    {
        if ($lead->contact_id) {
            return Contact::findOrFail($lead->contact_id);
        }

        $contact = null;
        if ($lead->whatsapp_jid) {
            $contact = Contact::query()->where('whatsapp_jid', $lead->whatsapp_jid)->first();
        }

        if (! $contact) {
            $contact = Contact::create([
                'clinic_id' => $lead->clinic_id,
                'name' => $lead->name,
                'email' => $lead->email,
                'mobile' => $lead->mobile,
                'whatsapp_jid' => $lead->whatsapp_jid,
                'instagram' => $lead->instagram,
                'organization_id' => $lead->organization_id,
            ]);
        }

        if ((int) $lead->contact_id !== (int) $contact->id) {
            $lead->forceFill(['contact_id' => $contact->id])->save();
        }

        return $contact;
    }
}
