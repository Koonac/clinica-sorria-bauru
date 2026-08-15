<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contacts', function (Blueprint $table) {
            $table->string('avatar_path', 255)->nullable()->after('notes');
            $table->string('avatar_status', 20)->nullable()->after('avatar_path');
            $table->timestampTz('avatar_fetched_at')->nullable()->after('avatar_status');
        });
    }

    public function down(): void
    {
        Schema::table('contacts', function (Blueprint $table) {
            $table->dropColumn(['avatar_path', 'avatar_status', 'avatar_fetched_at']);
        });
    }
};
