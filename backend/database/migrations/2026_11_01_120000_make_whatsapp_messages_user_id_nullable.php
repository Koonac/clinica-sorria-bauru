<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver !== 'sqlite') {
            Schema::table('whatsapp_messages', function (Blueprint $table) {
                $table->dropForeign(['user_id']);
            });
        }

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE whatsapp_messages ALTER COLUMN user_id DROP NOT NULL');
        } else {
            Schema::table('whatsapp_messages', function (Blueprint $table) {
                $table->unsignedBigInteger('user_id')->nullable()->change();
            });
        }

        if ($driver !== 'sqlite') {
            Schema::table('whatsapp_messages', function (Blueprint $table) {
                $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        $driver = DB::getDriverName();

        if ($driver !== 'sqlite') {
            Schema::table('whatsapp_messages', function (Blueprint $table) {
                $table->dropForeign(['user_id']);
            });
        }

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE whatsapp_messages ALTER COLUMN user_id SET NOT NULL');
        } else {
            Schema::table('whatsapp_messages', function (Blueprint $table) {
                $table->unsignedBigInteger('user_id')->nullable(false)->change();
            });
        }

        if ($driver !== 'sqlite') {
            Schema::table('whatsapp_messages', function (Blueprint $table) {
                $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            });
        }
    }
};
