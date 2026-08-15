<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'whatsapp_session_id')) {
            return;
        }

        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'whatsapp_default_lead_stage_id')) {
                $table->dropConstrainedForeignId('whatsapp_default_lead_stage_id');
            }
        });

        // SQLite exige remover índices unique antes do dropColumn.
        Schema::table('users', function (Blueprint $table) {
            try {
                $table->dropUnique('users_whatsapp_session_id_unique');
            } catch (\Throwable) {
                // Índice pode já ter sido removido / nome diferente.
            }
            try {
                $table->dropUnique('users_whatsapp_webhook_token_unique');
            } catch (\Throwable) {
            }
        });

        $columns = array_values(array_filter([
            'whatsapp_api_username',
            'whatsapp_api_password',
            'whatsapp_session_id',
            'whatsapp_webhook_token',
            'whatsapp_status',
            'whatsapp_is_business',
            'whatsapp_phone',
            'whatsapp_qr',
        ], fn (string $column) => Schema::hasColumn('users', $column)));

        if ($columns !== []) {
            Schema::table('users', function (Blueprint $table) use ($columns) {
                $table->dropColumn($columns);
            });
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('whatsapp_api_username', 190)->nullable();
            $table->text('whatsapp_api_password')->nullable();
            $table->uuid('whatsapp_session_id')->nullable()->unique();
            $table->string('whatsapp_webhook_token', 64)->nullable()->unique();
            $table->string('whatsapp_status', 32)->nullable();
            $table->boolean('whatsapp_is_business')->default(false);
            $table->string('whatsapp_phone', 40)->nullable();
            $table->text('whatsapp_qr')->nullable();
            $table->foreignId('whatsapp_default_lead_stage_id')->nullable()->constrained('pipeline_stages')->nullOnDelete();
        });
    }
};
