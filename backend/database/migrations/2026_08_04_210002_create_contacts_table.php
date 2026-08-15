<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 190);
            $table->string('email', 190)->nullable()->index();
            $table->string('phone', 40)->nullable();
            $table->string('mobile', 40)->nullable()->index();
            $table->string('whatsapp_jid', 80)->nullable();
            $table->string('instagram', 120)->nullable();
            $table->string('job_title', 120)->nullable();
            $table->text('notes')->nullable();
            $table->timestampsTz();
        });

        // Unique parcial: permite vários NULL, mas nunca dois contatos com o mesmo JID.
        DB::statement(
            'CREATE UNIQUE INDEX contacts_whatsapp_jid_unique ON contacts (whatsapp_jid) WHERE whatsapp_jid IS NOT NULL'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('contacts');
    }
};
