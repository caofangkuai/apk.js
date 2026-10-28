package com.example.helloworld;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;

public class SecondActivity extends Activity {

    static final String EXTRA_MESSAGE = "com.example.helloworld.MESSAGE";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_second);

        TextView message = (TextView) findViewById(R.id.second_message);
        String extra = getIntent() != null ? getIntent().getStringExtra(EXTRA_MESSAGE) : null;
        if (extra == null || extra.length() == 0) {
            message.setText("（没有收到参数）");
        } else {
            message.setText("收到参数：" + extra);
        }

        Button back = (Button) findViewById(R.id.second_back);
        back.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
    }
}
