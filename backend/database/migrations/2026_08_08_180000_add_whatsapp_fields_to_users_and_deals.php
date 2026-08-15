<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('whatsapp_api_username')->nullable()->after('password');
            $table->text('whatsapp_api_password')->nullable()->after('whatsapp_api_username');
            $table->string('whatsapp_session_id', 120)->nullable()->unique()->after('whatsapp_api_password');
            $table->string('whatsapp_webhook_token', 80)->nullable()->unique()->after('whatsapp_session_id');
            $table->string('whatsapp_status', 30)->nullable()->after('whatsapp_webhook_token');
            $table->string('whatsapp_phone', 40)->nullable()->after('whatsapp_status');
            $table->text('whatsapp_qr')->nullable()->after('whatsapp_phone');
        });

        Schema::table('deals', function (Blueprint $table) {
            $table->string('whatsapp_jid', 80)->nullable()->index()->after('source_id');
        });
    }

    public function down(): void
    {
        Schema::table('deals', function (Blueprint $table) {
            $table->dropColumn('whatsapp_jid');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'whatsapp_api_username',
                'whatsapp_api_password',
                'whatsapp_session_id',
                'whatsapp_webhook_token',
                'whatsapp_status',
                'whatsapp_phone',
                'whatsapp_qr',
            ]);
        });
    }
};
