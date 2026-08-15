<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('connections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clinic_id')->constrained('clinics')->cascadeOnDelete();
            $table->string('name', 120)->nullable();
            $table->string('api_username', 190)->nullable();
            $table->text('api_password')->nullable();
            $table->uuid('session_id')->nullable()->unique();
            $table->string('webhook_token', 64)->nullable()->unique();
            $table->string('status', 32)->default('disconnected');
            $table->string('phone', 40)->nullable();
            $table->text('qr')->nullable();
            $table->boolean('is_business')->default(false);
            $table->foreignId('default_lead_stage_id')->nullable()->constrained('pipeline_stages')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampsTz();

            $table->unique('clinic_id');
        });

        $defaultClinicId = DB::table('clinics')->orderBy('id')->value('id');

        if ($defaultClinicId && Schema::hasColumn('users', 'whatsapp_session_id')) {
            $source = DB::table('users')
                ->whereNotNull('whatsapp_session_id')
                ->orderByRaw("CASE WHEN role = 'admin' THEN 0 ELSE 1 END")
                ->orderBy('id')
                ->first();

            if (! $source) {
                $source = DB::table('users')
                    ->whereNotNull('whatsapp_api_username')
                    ->orderByRaw("CASE WHEN role = 'admin' THEN 0 ELSE 1 END")
                    ->orderBy('id')
                    ->first();
            }

            if ($source) {
                $connectionId = DB::table('connections')->insertGetId([
                    'clinic_id' => $defaultClinicId,
                    'name' => 'WhatsApp principal',
                    'api_username' => $source->whatsapp_api_username,
                    'api_password' => $source->whatsapp_api_password,
                    'session_id' => $source->whatsapp_session_id,
                    'webhook_token' => $source->whatsapp_webhook_token,
                    'status' => $source->whatsapp_status ?? 'disconnected',
                    'phone' => $source->whatsapp_phone,
                    'qr' => $source->whatsapp_qr,
                    'is_business' => (bool) ($source->whatsapp_is_business ?? false),
                    'default_lead_stage_id' => $source->whatsapp_default_lead_stage_id ?? null,
                    'created_by' => $source->id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                if (Schema::hasTable('whatsapp_messages')) {
                    Schema::table('whatsapp_messages', function (Blueprint $table) {
                        if (! Schema::hasColumn('whatsapp_messages', 'connection_id')) {
                            $table->foreignId('connection_id')->nullable()->after('clinic_id')->constrained('connections')->nullOnDelete();
                        }
                    });

                    DB::table('whatsapp_messages')->whereNull('connection_id')->update([
                        'connection_id' => $connectionId,
                        'clinic_id' => $defaultClinicId,
                    ]);
                }

                if (Schema::hasTable('whatsapp_campaigns')) {
                    DB::table('whatsapp_campaigns')->whereNull('clinic_id')->update(['clinic_id' => $defaultClinicId]);
                }
            }
        }

        if (Schema::hasTable('whatsapp_messages') && ! Schema::hasColumn('whatsapp_messages', 'connection_id')) {
            Schema::table('whatsapp_messages', function (Blueprint $table) {
                $table->foreignId('connection_id')->nullable()->after('clinic_id')->constrained('connections')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('whatsapp_messages') && Schema::hasColumn('whatsapp_messages', 'connection_id')) {
            Schema::table('whatsapp_messages', function (Blueprint $table) {
                $table->dropConstrainedForeignId('connection_id');
            });
        }

        Schema::dropIfExists('connections');
    }
};
