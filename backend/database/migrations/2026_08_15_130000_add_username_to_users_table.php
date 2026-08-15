<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('username', 64)->nullable()->after('name');
        });

        $users = DB::table('users')->orderBy('id')->get(['id', 'name', 'email']);
        foreach ($users as $user) {
            $base = strtolower((string) preg_replace('/[^a-zA-Z0-9._-]+/', '', (string) $user->name));
            if ($base === '') {
                $base = 'user';
            }
            $candidate = $base;
            $n = 1;
            while (DB::table('users')->where('username', $candidate)->where('id', '!=', $user->id)->exists()) {
                $candidate = $base.$n;
                $n++;
            }
            DB::table('users')->where('id', $user->id)->update(['username' => $candidate]);
        }

        DB::table('users')
            ->where('email', 'admin@vekta.local')
            ->update(['username' => 'Admin', 'name' => 'Admin']);

        Schema::table('users', function (Blueprint $table) {
            $table->string('username', 64)->nullable(false)->change();
            $table->unique('username');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['username']);
            $table->dropColumn('username');
        });
    }
};
