<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $defaultClinicId = DB::table('clinics')->orderBy('id')->value('id');

        if (! $defaultClinicId) {
            // A config do .env é adotada pela clínica default: o GoogleCalendarClient
            // lê apenas da clínica, sem fallback para o .env.
            $refreshToken = config('services.google_calendar.refresh_token');

            $defaultClinicId = DB::table('clinics')->insertGetId([
                'name' => 'Clínica Sorria Bauru',
                'slug' => 'sorria-bauru',
                'is_active' => true,
                'google_calendar_refresh_token' => filled($refreshToken)
                    ? Crypt::encryptString((string) $refreshToken)
                    : null,
                'google_calendar_id' => config('services.google_calendar.calendar_id'),
                'google_calendar_timezone' => config('services.google_calendar.timezone'),
                'google_calendar_business_start' => config('services.google_calendar.business_hours_start'),
                'google_calendar_business_end' => config('services.google_calendar.business_hours_end'),
                'google_calendar_slot_minutes' => config('services.google_calendar.slot_minutes'),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $tables = [
            'leads',
            'deals',
            'contacts',
            'organizations',
            'pipeline_stages',
            'tasks',
            'activities',
            'whatsapp_messages',
            'whatsapp_campaigns',
            'agents',
        ];

        foreach ($tables as $table) {
            if (! Schema::hasTable($table) || Schema::hasColumn($table, 'clinic_id')) {
                continue;
            }

            Schema::table($table, function (Blueprint $blueprint) use ($table) {
                $blueprint->foreignId('clinic_id')->nullable()->after('id')->constrained('clinics')->cascadeOnDelete();
            });

            DB::table($table)->whereNull('clinic_id')->update(['clinic_id' => $defaultClinicId]);

            // SQLite (tests) may not allow change to non-nullable easily; leave nullable with FK.
            // Postgres production: enforce not null via a follow-up when safe.
        }

        DB::table('users')->whereNull('clinic_id')->where('role', 'funcionario')->update(['clinic_id' => $defaultClinicId]);

        if (Schema::hasTable('contacts')) {
            $this->replaceContactsWhatsappUnique($defaultClinicId);
        }

        if (Schema::hasTable('pipeline_stages')) {
            $this->replacePipelineStagesUnique();
        }
    }

    public function down(): void
    {
        $tables = [
            'agents',
            'whatsapp_campaigns',
            'whatsapp_messages',
            'activities',
            'tasks',
            'pipeline_stages',
            'organizations',
            'contacts',
            'deals',
            'leads',
        ];

        foreach ($tables as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'clinic_id')) {
                Schema::table($table, function (Blueprint $blueprint) {
                    $blueprint->dropConstrainedForeignId('clinic_id');
                });
            }
        }
    }

    private function replaceContactsWhatsappUnique(int $defaultClinicId): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS contacts_whatsapp_jid_unique');
            DB::statement(
                'CREATE UNIQUE INDEX contacts_clinic_whatsapp_jid_unique ON contacts (clinic_id, whatsapp_jid) WHERE whatsapp_jid IS NOT NULL'
            );

            return;
        }

        // sqlite / others: drop old unique index if present, add composite unique ignoring nulls loosely
        try {
            Schema::table('contacts', function (Blueprint $table) {
                $table->dropUnique('contacts_whatsapp_jid_unique');
            });
        } catch (\Throwable) {
            // index may have been created via raw SQL
            try {
                DB::statement('DROP INDEX IF EXISTS contacts_whatsapp_jid_unique');
            } catch (\Throwable) {
            }
        }

        Schema::table('contacts', function (Blueprint $table) {
            $table->unique(['clinic_id', 'whatsapp_jid'], 'contacts_clinic_whatsapp_jid_unique');
        });
    }

    private function replacePipelineStagesUnique(): void
    {
        Schema::table('pipeline_stages', function (Blueprint $table) {
            $table->dropUnique(['kind', 'slug']);
            $table->unique(['clinic_id', 'kind', 'slug'], 'pipeline_stages_clinic_kind_slug_unique');
        });
    }
};
