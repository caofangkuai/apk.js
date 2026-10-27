package com.example.helloworld;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {

    private int clicks = 0;
    private TextView title;
    private TextView subtitle;
    private TextView count;
    private Button action;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        title = (TextView) findViewById(R.id.title);
        subtitle = (TextView) findViewById(R.id.subtitle);
        count = (TextView) findViewById(R.id.count);
        action = (Button) findViewById(R.id.action);

        title.setText("Hello World");
        subtitle.setText(getResources().getString(R.string.hint));
        action.setText(getResources().getString(R.string.action));

        action.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                clicks = clicks + 1;
                count.setText("已点击 " + clicks + " 次");
                if (clicks == 1) {
                    Toast.makeText(MainActivity.this, "DEX 方法被调用了", Toast.LENGTH_SHORT).show();
                } else {
                    Toast.makeText(MainActivity.this, "点击次数: " + clicks, Toast.LENGTH_SHORT).show();
                }
                if (clicks >= 5) {
                    action.setText("再来一次");
                    subtitle.setText("事件分发链路已跑通");
                }
            }
        });

        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                subtitle.setText(getResources().getString(R.string.hint));
            }
        }, 350);
    }

    @Override
    protected void onResume() {
        super.onResume();
    }
}
